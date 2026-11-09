#!/usr/bin/env python3
"""Extrae payloads UDP de capturas NetFlow/IPFIX (.pcap/.pcapng) a fixtures.

T4.3 (M4): genera los datagramas binarios que prueba el colector a partir de
capturas reales (ver fixtures/wireshark/README.md para la fuente y las
instrucciones de regeneración). Solo stdlib, sin scapy ni dpkt.

Uso:
  python3 scripts/extract-udp-payloads.py CAPTURA.pcapng [-o DIR]

Por cada paquete UDP imprimido escribe <protocolo>-<NN>.bin en DIR (por
defecto: fixtures/wireshark-extracted/ junto al crate sc-collector) y un
manifiesto JSON en stdout.

Soporta pcap clásico (d4c3b2a1/a1b2c3d4) y pcapng (bloques SHB/IDB/EPB/SPB)
con linktypes Ethernet (1), Raw IP (101/228/229) y Linux cooked (113). Solo
se conservan datagramas UDP (IP proto 17); el resto se ignora.
"""

import argparse
import hashlib
import ipaddress
import json
import struct
import sys
from pathlib import Path


def read_pcap_records(data: bytes):
    """Yield (packet_bytes, linktype) de un pcap clásico."""
    magic = data[:4]
    # d4c3b2a1 / a1b2c3d4 (us) y 4d3cb2a1 / a1b23c4d (ns), LE y BE.
    table = {
        b"\xd4\xc3\xb2\xa1": (True, "us"),
        b"\xa1\xb2\xc3\xd4": (False, "us"),
        b"\x4d\x3c\xb2\xa1": (True, "ns"),
        b"\xa1\xb2\x3c\x4d": (False, "ns"),
    }
    if magic not in table:
        raise ValueError("pcap: magic no reconocida")
    little, _ = table[magic]
    endian = "<" if little else ">"
    if len(data) < 24:
        raise ValueError("pcap: header truncado")
    (_, _, _, _, _, _, linktype) = struct.unpack(endian + "IHHiIII", data[:24])
    offset = 24
    while offset + 16 <= len(data):
        (_, _, incl_len, _) = struct.unpack(endian + "IIII", data[offset : offset + 16])
        offset += 16
        if incl_len > len(data) - offset:
            break
        yield data[offset : offset + incl_len], int(linktype)
        offset += incl_len


def read_pcapng_records(data: bytes):
    """Yield (packet_bytes, linktype) de un pcapng."""
    shb_endian = ">"
    offset = 0
    linktype = 1
    while offset + 12 <= len(data):
        block_type, block_len = struct.unpack(shb_endian + "II", data[offset : offset + 8])
        if block_type == 0x0A0D0D0A:
            # Byte-order magic ap01529-... : dice endianness (0x1A2B3C4D).
            bom = struct.unpack(">I", data[offset + 8 : offset + 12])[0]
            shb_endian = ">" if bom == 0x1A2B3C4D else "<"
            block_type, block_len = struct.unpack(shb_endian + "II", data[offset : offset + 8])
        if block_len < 12 or offset + block_len > len(data):
            break
        body = data[offset + 8 : offset + block_len - 4]
        if block_type == 1:  # IDB
            if len(body) >= 2:
                linktype = struct.unpack(shb_endian + "H", body[:2])[0]
        elif block_type == 6:  # EPB: if_id, ts_high, ts_low, cap_len, pkt_len
            if len(body) >= 20:
                (_, _, _, cap_len, _) = struct.unpack(shb_endian + "IIIII", body[:20])
                packet = body[20 : 20 + cap_len]
                if len(packet) == cap_len:
                    yield packet, int(linktype)
        elif block_type == 3:  # SPB: original_len (u32), data en +4
            if len(body) >= 4:
                cap_len = struct.unpack(shb_endian + "I", body[:4])[0]
                packet = body[4 : 4 + cap_len]
                if len(packet) == cap_len:
                    yield packet, int(linktype)
        offset += block_len


def iter_packets(data: bytes):
    if data[:4] == b"\x0a\x0d\x0d\x0a":
        yield from read_pcapng_records(data)
    else:
        yield from read_pcap_records(data)


def skip_linktype(packet: bytes, linktype: int):
    """Devuelve el payload IP (o None) según el linktype."""
    if linktype == 1:  # Ethernet
        if len(packet) < 14:
            return None
        ethertype = struct.unpack(">H", packet[12:14])[0]
        off = 14
        if ethertype == 0x8100:  # 802.1Q
            if len(packet) < 18:
                return None
            ethertype = struct.unpack(">H", packet[16:18])[0]
            off = 18
        if ethertype not in (0x0800, 0x86DD):
            return None
        return packet[off:]
    if linktype in (101, 228, 229):  # IP crudo
        return packet
    return None


def udp_payload(ip: bytes):
    """Devuelve (src, sport, dst, dport, payload) UDP o None."""
    if not ip:
        return None
    version = ip[0] >> 4
    if version == 4:
        if len(ip) < 20:
            return None
        ihl = (ip[0] & 0x0F) * 4
        if len(ip) < ihl or ip[9] != 17:
            return None
        src = str(ipaddress.IPv4Address(ip[12:16]))
        dst = str(ipaddress.IPv4Address(ip[16:20]))
    elif version == 6:
        if len(ip) < 40 or ip[6] != 17:
            return None
        ihl = 40
        src = str(ipaddress.IPv6Address(ip[8:24]))
        dst = str(ipaddress.IPv6Address(ip[24:40]))
    else:
        return None
    if len(ip) < ihl + 8:
        return None
    sport, dport, udp_len, _ = struct.unpack(">HHHH", ip[ihl : ihl + 8])
    if udp_len < 8 or ihl + udp_len > len(ip):
        return None
    return src, sport, dst, dport, ip[ihl + 8 : ihl + udp_len]


def detect_version(payload: bytes):
    if len(payload) >= 2:
        return struct.unpack(">H", payload[:2])[0]
    return None


PROTO_NAMES = {5: "netflow-v5", 9: "netflow-v9", 10: "ipfix"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", nargs="+", help="ficheros .pcap/.pcapng")
    parser.add_argument("-o", "--out", default=None, help="directorio de salida")
    args = parser.parse_args()

    if args.out is None:
        crate = Path(__file__).resolve().parent.parent / "agent" / "crates" / "sc-collector"
        args.out = str(crate / "fixtures" / "wireshark-extracted")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    manifest = []
    counter = 0
    tsv_lines = ["fixture\tsrc_ip\tsrc_port\tdst_ip\tdst_port\tversion\tpayload_len"]
    for name in args.captures:
        path = Path(name)
        data = path.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        for i, (packet, linktype) in enumerate(iter_packets(data)):
            ip = skip_linktype(packet, linktype)
            udp = udp_payload(ip) if ip else None
            if udp is None:
                continue
            src, sport, dst, dport, payload = udp
            version = detect_version(payload)
            proto = PROTO_NAMES.get(version, f"desconocido-{version}")
            counter += 1
            filename = f"{proto}-{counter:03d}.bin"
            (out / filename).write_bytes(payload)
            tsv_lines.append(
                f"{filename}\t{src}\t{sport}\t{dst}\t{dport}\t{version}\t{len(payload)}"
            )
            manifest.append(
                {
                    "fixture": filename,
                    "source_file": str(path),
                    "source_sha256": sha256,
                    "packet_index": i,
                    "src": f"{src}:{sport}",
                    "dst": f"{dst}:{dport}",
                    "version": version,
                    "payload_len": len(payload),
                    "payload_sha256": hashlib.sha256(payload).hexdigest(),
                }
            )
    json.dump(manifest, sys.stdout, indent=2, ensure_ascii=False)
    print()
    (out / "manifest.tsv").write_text("\n".join(tsv_lines) + "\n")
    print(f"# {len(manifest)} payloads en {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
