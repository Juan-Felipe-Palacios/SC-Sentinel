import { describe, expect, it, vi } from 'vitest';
import { fetchAiFacts } from '@/lib/ai/facts';

function fakeDb(responses: unknown[][]) {
  const execute = vi.fn();
  for (const response of responses) execute.mockResolvedValueOnce(response);
  return { execute } as never;
}

const windowRow = {
  window_id: 'win_1',
  start_at: '2026-11-03T10:00:00.000Z',
  end_at: '2026-11-03T10:00:30.000Z',
  snapshot_json: {
    top_hosts: [{ host_key: 'a', ip_display: '203.0.113.9', country: 'AR', bytes_in: 700, bytes_out: 800, packets: 10 }],
    top_ports: [{ port: 443, protocol: 'tcp', bytes: 1500, connections: 2 }],
    top_countries: [{ country: 'AR', bytes: 1500, hosts: 1 }],
    health: { capture_status: 'ok', packets_seen: 55, packets_dropped: 1, parse_errors: 0 },
  },
};

describe('fetchAiFacts', () => {
  it('devuelve null cuando no hay ventanas', async () => {
    const db = fakeDb([[]]);
    expect(await fetchAiFacts('dev_x', db)).toBeNull();
  });

  it('agrega facts de la última ventana con snapshot_json', async () => {
    const db = fakeDb([
      [windowRow],
      [{ bytes_in: '100', bytes_out: '200', packets: '7' }],
      [{ rule_id: 'vol', severity: 'high', title: 'Pico' }],
    ]);
    const facts = await fetchAiFacts('dev_x', db);
    expect(facts).not.toBeNull();
    expect(facts!.total_bytes).toBe(300);
    expect(facts!.total_packets).toBe(7);
    expect(facts!.top_hosts[0]).toEqual({ host_key: 'a', ip: '203.0.113.9', country: 'AR', bytes: 1500, packets: 10 });
    expect(facts!.top_ports[0]).toEqual({ port: 443, protocol: 'tcp', bytes: 1500, connections: 2 });
    expect(facts!.alerts).toEqual([{ rule_id: 'vol', severity: 'high', title: 'Pico' }]);
    expect(facts!.health).toMatchObject({ capture_status: 'ok', packets_seen: 55 });
  });

  it('device vacío devuelve null sin tocar la base', async () => {
    const db = fakeDb([]);
    expect(await fetchAiFacts('', db)).toBeNull();
  });
});
