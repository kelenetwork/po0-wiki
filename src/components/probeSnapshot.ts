import { useEffect, useMemo, useState } from 'react';

export type PublicProbeStatus = 'online' | 'warn' | 'pending' | 'offline' | 'ok' | string;

export type PublicProbeItem = {
  id: string;
  display_name: string;
  region: string;
  tags: string[];
  status: PublicProbeStatus;
  updated_at: string;
  show_in_lg?: boolean;
};

export type PublicProbeCheck = {
  id: string;
  display_name: string;
  source_id: string;
  target_id: string;
  tags: string[];
  status: PublicProbeStatus;
  latency_ms: number;
  loss_pct: number;
  jitter_ms: number;
  updated_at: string;
};

export type PublicProbePoint = {
  updated_at: string;
  latency_ms: number;
  loss_pct: number;
  jitter_ms: number;
};

export type PublicProbeSeries = {
  check_id: string;
  points: PublicProbePoint[];
};

export type PublicProbeSnapshot = {
  sources: PublicProbeItem[];
  targets: PublicProbeItem[];
  checks: PublicProbeCheck[];
  series: PublicProbeSeries[];
};

const MOCK_UPDATED_AT = '2026-04-30T00:00:00+08:00';

export const mockProbeSnapshot: PublicProbeSnapshot = {
  sources: [
    { id: 'src-hk-edge', display_name: 'HK-Edge-01', region: '香港', tags: ['CMI', 'HGC'], status: 'online', updated_at: MOCK_UPDATED_AT },
    { id: 'src-tyo-lg', display_name: 'TYO-LG-02', region: '日本', tags: ['IIJ', 'JPIX'], status: 'online', updated_at: MOCK_UPDATED_AT },
    { id: 'src-sin-core', display_name: 'SIN-Core-01', region: '新加坡', tags: ['SGIX', 'Transit'], status: 'warn', updated_at: MOCK_UPDATED_AT },
    { id: 'src-cn-probe', display_name: 'CN-Probe-01', region: '大陆源', tags: ['待接入'], status: 'pending', updated_at: MOCK_UPDATED_AT },
  ],
  targets: [
    { id: 'tgt-wiki', display_name: 'Wiki Portal', region: 'Global', tags: ['web'], status: 'online', updated_at: MOCK_UPDATED_AT, show_in_lg: true },
    { id: 'tgt-api', display_name: 'API Gateway', region: 'Global', tags: ['api'], status: 'online', updated_at: MOCK_UPDATED_AT, show_in_lg: true },
    { id: 'tgt-cdn', display_name: 'CDN Edge', region: 'Global', tags: ['cdn'], status: 'warn', updated_at: MOCK_UPDATED_AT, show_in_lg: true },
    { id: 'tgt-origin', display_name: 'Origin Service', region: 'Private', tags: ['internal'], status: 'pending', updated_at: MOCK_UPDATED_AT, show_in_lg: true },
  ],
  checks: [
    { id: 'chk-hk-wiki', display_name: '香港 → Wiki', source_id: 'src-hk-edge', target_id: 'tgt-wiki', tags: ['tcp'], status: 'ok', latency_ms: 18, loss_pct: 0, jitter_ms: 2, updated_at: MOCK_UPDATED_AT },
    { id: 'chk-tyo-api', display_name: '东京 → API', source_id: 'src-tyo-lg', target_id: 'tgt-api', tags: ['tcp'], status: 'ok', latency_ms: 42, loss_pct: 0, jitter_ms: 5, updated_at: MOCK_UPDATED_AT },
    { id: 'chk-sin-cdn', display_name: '新加坡 → CDN', source_id: 'src-sin-core', target_id: 'tgt-cdn', tags: ['tcp'], status: 'warn', latency_ms: 67, loss_pct: 0.2, jitter_ms: 9, updated_at: MOCK_UPDATED_AT },
    { id: 'chk-cn-origin', display_name: '大陆源 → Origin', source_id: 'src-cn-probe', target_id: 'tgt-origin', tags: ['tcp'], status: 'pending', latency_ms: 0, loss_pct: 0, jitter_ms: 0, updated_at: MOCK_UPDATED_AT },
  ],
  series: [
    {
      check_id: 'chk-hk-wiki',
      points: [
        { updated_at: '00:00', latency_ms: 22, loss_pct: 0, jitter_ms: 2 },
        { updated_at: '04:00', latency_ms: 19, loss_pct: 0, jitter_ms: 2 },
        { updated_at: '08:00', latency_ms: 21, loss_pct: 0, jitter_ms: 3 },
        { updated_at: '12:00', latency_ms: 17, loss_pct: 0, jitter_ms: 2 },
        { updated_at: '16:00', latency_ms: 18, loss_pct: 0, jitter_ms: 2 },
        { updated_at: '20:00', latency_ms: 20, loss_pct: 0, jitter_ms: 3 },
      ],
    },
  ],
};

function isPublicProbeSnapshot(value: unknown): value is PublicProbeSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PublicProbeSnapshot>;
  return Array.isArray(candidate.sources)
    && Array.isArray(candidate.targets)
    && Array.isArray(candidate.checks)
    && Array.isArray(candidate.series)
    && candidate.sources.length > 0
    && candidate.targets.length > 0
    && candidate.checks.length > 0;
}

export function usePublicProbeSnapshot() {
  const [snapshot, setSnapshot] = useState<PublicProbeSnapshot>(mockProbeSnapshot);
  const [origin, setOrigin] = useState<'api' | 'mock'>('mock');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/public/probes/snapshot', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('snapshot unavailable');
        return response.json();
      })
      .then((data: unknown) => {
        if (!isPublicProbeSnapshot(data)) throw new Error('snapshot empty');
        setSnapshot(data);
        setOrigin('api');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSnapshot(mockProbeSnapshot);
          setOrigin('mock');
        }
      });

    return () => controller.abort();
  }, []);

  return useMemo(() => ({ snapshot, origin }), [snapshot, origin]);
}
