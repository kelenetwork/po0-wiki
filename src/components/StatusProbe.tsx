import './StatusProbe.css';

type Probe = {
  name: string;
  target: string;
  latency: string;
  status: 'online' | 'pending';
};

type StatusProbeProps = {
  compact?: boolean;
};

const probes: Probe[] = [
  { name: 'Wiki Web', target: 'wiki.kele.my:443', latency: '18 ms', status: 'online' },
  { name: 'TCPing API', target: 'probe.internal:8080', latency: '待接入', status: 'pending' },
  { name: 'Edge Tunnel', target: 'cf-tunnel', latency: '待配置', status: 'pending' },
];

export default function StatusProbe({ compact = false }: StatusProbeProps) {
  return (
    <section className={compact ? 'status-probe compact' : 'status-probe'}>
      <div className="status-head">
        <div>
          <p className="status-kicker">Service Probe</p>
          <h3>服务探测占位</h3>
        </div>
        <span className="status-pill">静态预览</span>
      </div>
      <div className="probe-list">
        {probes.map((probe) => (
          <div className="probe-row" key={probe.name}>
            <span className={`dot ${probe.status}`} />
            <div>
              <strong>{probe.name}</strong>
              <small>{probe.target}</small>
            </div>
            <em>{probe.latency}</em>
          </div>
        ))}
      </div>
    </section>
  );
}
