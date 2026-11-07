import { NextRequest, NextResponse } from 'next/server';
import { authenticateDeviceToken } from '@/lib/auth/device';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { flowWindows, hostStats, alerts, agentHealth } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  // 1. Autenticación del device token
  const auth = await authenticateDeviceToken(request.headers.get('authorization'));
  if (!auth.valid) {
    return NextResponse.json(
      { error: auth.error || 'unauthorized', message: auth.reason || 'Invalid token' },
      { status: auth.error === 'forbidden' ? 403 : 401 }
    );
  }

  // 2. Parse request body
  let body: {
    message: string;
    includeHistorical?: boolean;
    includeAlerts?: boolean;
    includeTrends?: boolean;
    context?: {
      deviceId?: string;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Message is required' },
      { status: 400 }
    );
  }

  // 3. Build RAG context - flow windows
  const deviceId = body.includeHistorical !== false ? (body.context?.deviceId || auth.deviceId) : undefined;

  let ragText = '';
  const sources: Array<{ type: string; id: string; summary: string }> = [];

  if (deviceId) {
    // Query flow windows - has deviceId column
    const historicalFlows = await db
      .select({
        id: flowWindows.id,
        startAt: flowWindows.startAt,
        endAt: flowWindows.endAt,
        sequence: flowWindows.sequence,
      })
      .from(flowWindows)
      .where(eq(flowWindows.deviceId, deviceId))
      .limit(10);

    if (historicalFlows.length > 0) {
      ragText += `Historical flow data: ${historicalFlows.length} windows detected. `;
      historicalFlows.forEach((f) => {
        sources.push({
          type: 'flow_window',
          id: f.id,
          summary: `Window ${f.sequence}: ${f.startAt ? f.startAt.toISOString().split('T')[0] : 'unknown'}`,
        });
      });
    }

    // Query host stats (trends) - get limited results
    const hostStatsData = await db
      .select({
        hostKey: hostStats.hostKey,
        ip: hostStats.ipDisplay,
        country: hostStats.country,
        packetsSeen: hostStats.packets,
      })
      .from(hostStats)
      .limit(5);

    if (hostStatsData.length > 0) {
      ragText += `Host stats: ${hostStatsData.length} hosts monitored. `;
      hostStatsData.forEach((h) => {
        sources.push({
          type: 'host_stat',
          id: h.ip ?? h.hostKey,
          summary: `${h.country ?? 'unknown'} - ${h.packetsSeen} packets`,
        });
      });
    }

    // Query alerts (last 24h) - get all alerts, filter client-side by ID being a valid date
    const allAlerts = await db
      .select({
        id: alerts.id,
        severity: alerts.severity,
        title: alerts.title,
      })
      .from(alerts)
      .limit(50);

    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentAlerts = allAlerts.filter((a) => a.id && !isNaN(new Date(a.id).getTime()) && new Date(a.id).getTime() >= twentyFourHoursAgo);

    if (recentAlerts.length > 0) {
      ragText += `Alerts (last 24h): ${recentAlerts.length} found. `;
      recentAlerts.forEach((a) => {
        sources.push({
          type: 'alert',
          id: a.id,
          summary: `${a.severity}: ${a.title?.substring(0, 50)}`,
        });
      });
    }

    // Query agent health - has deviceId column
    const healthData = await db
      .select({
        packetsSeen: agentHealth.packetsSeen,
        status: agentHealth.captureStatus,
      })
      .from(agentHealth)
      .where(eq(agentHealth.deviceId, deviceId))
      .limit(1);

    if (healthData.length > 0) {
      ragText += `Agent health: ${healthData[0].packetsSeen} packets seen. `;
      sources.push({
        type: 'agent_health',
        id: 'agent',
        summary: `Status: ${healthData[0].status}`,
      });
    }
  }

  // 4. Detect exportability (F9) - keywords in Spanish
  const exportable = /(reporte|exportar|pdf|markdown)/i.test(message);

  // 5. Detect query type and add contextual suggestions (F12)
  const lowerMessage = message.toLowerCase();
  let suggestions: string[] = [
    '¿Qué IPs me atacaron?',
    'Explicar última alerta',
    'Recomendaciones de remediación',
  ];

  if (/ip|dirección/i.test(lowerMessage)) {
    suggestions.unshift('¿Explicar patrones de ataque?');
  }
  if (/alerta|alarm/i.test(lowerMessage)) {
    suggestions.unshift('Detalle de la causa raíz');
  }
  if (/tendencia|trend/i.test(lowerMessage)) {
    suggestions.unshift('Comparar con período anterior');
  }
  if (/correl|correlación/i.test(lowerMessage)) {
    suggestions.unshift('Factores de correlación');
  }
  if (/audit|auditoría/i.test(lowerMessage)) {
    suggestions.unshift('Ver historial de cambios');
  }
  if (/health|salud/i.test(lowerMessage)) {
    suggestions.unshift('Ver métricas de agente');
  }

  // Limit to max 3 suggestions
  suggestions = suggestions.slice(0, 3);

  // 6. Return response
  const response = {
    type: 'text',
    content: `Autenticado como device: ${auth.deviceId}. Mensaje: "${message}". ` + ragText,
    metadata: {
      queryType: 'search',
      executionTimeMs: 0,
      tokensUsed: Math.min(Math.floor(message.length / 4), 2000),
      sources,
    },
    suggestions,
    exportable,
  };

  return NextResponse.json(response, { status: 200 });
}
