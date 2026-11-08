// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { Network } from 'lucide-react';
import type { OverviewResponse } from '@/lib/api-types';
import { formatBytes, formatNum } from '@/lib/format';

/** Servicios well-known más frecuentes; el resto se muestra sin nombre. */
const SERVICE_NAMES: Record<number, string> = {
  20: 'FTP-data',
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  67: 'DHCP',
  68: 'DHCP',
  80: 'HTTP',
  110: 'POP3',
  123: 'NTP',
  135: 'RPC',
  139: 'NetBIOS',
  143: 'IMAP',
  161: 'SNMP',
  389: 'LDAP',
  443: 'HTTPS',
  445: 'SMB',
  587: 'SMTP',
  993: 'IMAPS',
  995: 'POP3S',
  1433: 'MSSQL',
  1521: 'Oracle',
  1883: 'MQTT',
  1900: 'SSDP',
  3306: 'MySQL',
  3389: 'RDP',
  5353: 'mDNS',
  5432: 'PostgreSQL',
  5900: 'VNC',
  6379: 'Redis',
  8080: 'HTTP-alt',
  8443: 'HTTPS-alt',
  9200: 'Elastic',
};

const PROTOCOL_STYLES: Record<string, { chip: string; bar: string; dot: string; label: string }> = {
  tcp: {
    chip: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
    bar: 'bg-sky-400',
    dot: 'bg-sky-400',
    label: 'TCP',
  },
  udp: {
    chip: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
    bar: 'bg-purple-400',
    dot: 'bg-purple-400',
    label: 'UDP',
  },
  other: {
    chip: 'text-slate-400 border-white/10 bg-slate-800/60',
    bar: 'bg-slate-500',
    dot: 'bg-slate-500',
    label: 'Otros',
  },
};

function protocolStyle(protocol: string) {
  return PROTOCOL_STYLES[protocol.toLowerCase()] ?? PROTOCOL_STYLES.other;
}

export function TopPortsTable({
  ports,
  protocols,
}: {
  ports: OverviewResponse['top_ports'];
  protocols: OverviewResponse['protocols'];
}) {
  const maxBytes = Math.max(...ports.map((port) => port.bytes), 0);
  const protocolTotal = protocols.reduce((sum, item) => sum + item.bytes, 0);

  return (
    <section aria-label="Puertos y protocolos" className="flex flex-col rounded-xl border-slate-800/80 bg-slate-900/60">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Network className="size-4 text-purple-400" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Puertos y protocolos</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400/60">
          {ports.length > 0 ? `Top ${ports.length}` : 'Sin datos'}
        </span>
      </header>

      {ports.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          <p className="font-display text-sm font-semibold text-slate-100">Sin puertos en el período</p>
          <p className="mt-2 max-w-[16rem] text-xs leading-5 text-slate-400">
            Cuando el agente agregue ventanas con puertos de destino, el ranking aparece acá.
          </p>
        </div>
      ) : (
        <ol className="flex-1 divide-y divide-slate-800/60">
          {ports.map((entry) => {
            const style = protocolStyle(entry.protocol);
            const service = SERVICE_NAMES[entry.port];
            const width = maxBytes > 0 ? Math.max(2, Math.round((entry.bytes / maxBytes) * 100)) : 0;

            return (
              <li key={`${entry.port}-${entry.protocol}`} className="px-5 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-11 shrink-0 font-mono text-[13px] font-medium tabular-nums text-slate-100">
                    {entry.port}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[12px] text-slate-100">{service ?? 'Sin identificar'}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
                      <span className={`rounded border px-1 py-px text-[8px] tracking-[0.14em] ${style.chip}`}>
                        {style.label}
                      </span>
                      {formatNum(entry.connections)} conex.
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-display text-[13px] font-semibold tabular-nums text-slate-100">
                    {formatBytes(entry.bytes)}
                  </p>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800/60" aria-hidden="true">
                  <div className={`h-full rounded-full ${style.bar} opacity-70`} style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {protocolTotal > 0 ? (
        <div className="border-t border-slate-800/80 px-5 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400">
            Distribución por protocolo
          </p>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-800/60" aria-hidden="true">
            {protocols.map((item) => (
              <div
                key={item.protocol}
                className={`h-full ${protocolStyle(item.protocol).bar}`}
                style={{ width: `${Math.max(1, Math.round((item.bytes / protocolTotal) * 100))}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {protocols.map((item) => (
              <li
                key={item.protocol}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400"
              >
                <span className={`size-1.5 rounded-full ${protocolStyle(item.protocol).dot}`} aria-hidden="true" />
                {protocolStyle(item.protocol).label}
                <span className="tabular-nums text-slate-100">{Math.round((item.bytes / protocolTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
