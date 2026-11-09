// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
'use client';
// Radar de superficie de exposición: cada eje es un protocolo o un puerto y el
// radio es su volumen relativo al máximo. Mezcla unidades solo en apariencia:
// todos los ejes miden bytes, así que la forma se lee como "dónde se concentra".
import { useMemo } from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { OverviewProtocolShare, OverviewTopPort } from '@/lib/api-types';
import { formatBytes, formatNum } from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { EmptyChart } from './EmptyChart';

const MAX_AXES = 8;
const SERVICE_BY_PORT: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  67: 'DHCP',
  80: 'HTTP',
  110: 'POP3',
  123: 'NTP',
  135: 'RPC',
  139: 'SMB',
  143: 'IMAP',
  161: 'SNMP',
  389: 'LDAP',
  443: 'HTTPS',
  445: 'SMB',
  465: 'SMTPS',
  587: 'SMTP',
  993: 'IMAPS',
  1433: 'MSSQL',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'Postgres',
  6379: 'Redis',
  8080: 'HTTP-alt',
  8443: 'HTTPS-alt',
  9200: 'Elastic',
  27017: 'Mongo',
};

interface Axis {
  subject: string;
  bytes: number;
  connections: number;
  relative: number;
  kind: 'protocolo' | 'puerto';
}

interface TooltipPayload {
  payload?: Axis;
}

function RadarTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const axis = payload?.[0]?.payload;
  if (!active || !axis) return null;
  return (
    <div className="rounded-lg border sc-hairline bg-sc-bg/95 px-3 py-2 shadow-xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-muted">
        {axis.kind} · {axis.subject}
      </p>
      <p className="mt-1 font-display text-sm font-semibold tabular-nums text-sc-text">{formatBytes(axis.bytes)}</p>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-sc-text-muted">
        {formatNum(axis.connections)} conexiones
      </p>
    </div>
  );
}

export function PortsRadar({
  ports,
  protocols,
}: {
  ports: OverviewTopPort[];
  protocols: OverviewProtocolShare[];
}) {
  const data = useMemo<Axis[]>(() => {
    const protocolAxes: Axis[] = protocols.slice(0, 3).map((item) => ({
      subject: item.protocol.toUpperCase(),
      bytes: item.bytes,
      connections: item.connections,
      relative: 0,
      kind: 'protocolo',
    }));
    const portAxes: Axis[] = ports.slice(0, MAX_AXES - protocolAxes.length).map((item) => ({
      subject: `:${item.port}${SERVICE_BY_PORT[item.port] ? ` ${SERVICE_BY_PORT[item.port]}` : ''}`,
      bytes: item.bytes,
      connections: item.connections,
      relative: 0,
      kind: 'puerto',
    }));
    const axes = [...protocolAxes, ...portAxes];
    const max = Math.max(...axes.map((axis) => axis.bytes), 0);
    if (max <= 0) return [];
    return axes.map((axis) => ({ ...axis, relative: (axis.bytes / max) * 100 }));
  }, [ports, protocols]);

  if (data.length < 3) {
    return (
      <EmptyChart
        title="Sin puertos ni protocolos suficientes"
        detail="El radar necesita al menos tres ejes. El agente todavía no publicó top_ports para estas ventanas."
      />
    );
  }

  return (
    <div className="w-full">
      <div
        className="h-[340px] w-full"
        role="img"
        aria-label={`Radar de puertos y protocolos: ${data.map((axis) => `${axis.subject} ${formatBytes(axis.bytes)}`).join(', ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke={VIZ.grid} />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: VIZ.muted, fontSize: 10, fontFamily: 'var(--font-plex-mono)' }}
            />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            <Radar
              name="Tráfico"
              dataKey="relative"
              stroke={VIZ.in}
              strokeWidth={2}
              fill={VIZ.in}
              fillOpacity={0.22}
              isAnimationActive={false}
              dot={{ r: 2.5, fill: VIZ.in, strokeWidth: 0 }}
            />
            <Tooltip content={<RadarTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase leading-5 tracking-[0.16em] text-sc-text-muted/70">
        Radio relativo al eje de mayor volumen · {data.length} ejes
      </p>
    </div>
  );
}
