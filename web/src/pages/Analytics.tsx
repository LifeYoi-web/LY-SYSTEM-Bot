import { useState, type CSSProperties } from 'react';
import { useAnalytics } from '../lib/hooks';
import { AreaChart, BarChart, Donut } from '../components/charts';
import { fmt, EmptyState, SkeletonRows } from '../components/ui';
import { Icon, type IconName } from '../lib/icons';

const RANGES = [7, 14, 30];
const DIST_COLORS: Record<string, string> = { ban: 'var(--danger)', kick: 'var(--warn)', mute: 'var(--info)', warn: 'var(--accent)' };
const DIST_LABELS: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

function Total({ icon, label, value, color }: { icon: IconName; label: string; value: number; color: string }) {
  return (
    <div className="kpi" style={{ ['--ico-glow' as string]: color } as CSSProperties}>
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background: color }}>
          <Icon name={icon} />
        </div>
      </div>
      <div className="kpi-value tnum">{fmt(value)}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export function Analytics() {
  const [days, setDays] = useState(14);
  const { data, isLoading, error } = useAnalytics(days);

  const series = data?.series ?? [];
  const labels = series.map((p) => p.date.slice(5));

  return (
    <div className="stack">
      <div className="between wrap">
        <p className="page-intro" style={{ margin: 0 }}>
          تحليلات نشاط السيرفر على مدى الفترة المختارة.
        </p>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'on' : ''} onClick={() => setDays(r)}>
              {r} يوم
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="err-text">تعذّر تحميل الإحصائيات.</p>
      ) : isLoading || !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div className="kpi-grid">
            <Total icon="message" label="إجمالي الرسائل" value={data.totals.messages} color="rgba(245,124,0,0.18)" />
            <Total icon="user-plus" label="انضمامات" value={data.totals.joins} color="rgba(54,196,111,0.16)" />
            <Total icon="user-minus" label="مغادرات" value={data.totals.leaves} color="rgba(240,73,79,0.16)" />
            <Total icon="shield" label="إجراءات إشرافية" value={data.totals.modActions} color="rgba(91,155,243,0.16)" />
          </div>

          <div className="card card-pad">
            <div className="card-hd">
              <div className="card-title">
                <Icon name="message" /> الرسائل يوميًا
              </div>
            </div>
            <AreaChart labels={labels} series={[{ name: 'الرسائل', color: 'var(--accent)', values: series.map((p) => p.messages) }]} height={240} />
          </div>

          <div className="grid grid-2">
            <div className="card card-pad">
              <div className="card-hd">
                <div className="card-title">
                  <Icon name="users" /> الانضمام مقابل المغادرة
                </div>
                <div className="chart-legend">
                  <span className="lg">
                    <span className="sw" style={{ background: 'var(--success)' }} /> انضمام
                  </span>
                  <span className="lg">
                    <span className="sw" style={{ background: 'var(--danger)' }} /> مغادرة
                  </span>
                </div>
              </div>
              <AreaChart
                labels={labels}
                height={200}
                series={[
                  { name: 'انضمام', color: 'var(--success)', values: series.map((p) => p.joins) },
                  { name: 'مغادرة', color: 'var(--danger)', values: series.map((p) => p.leaves) },
                ]}
              />
            </div>

            <div className="card card-pad">
              <div className="card-hd">
                <div className="card-title">
                  <Icon name="shield" /> الإجراءات الإشرافية
                </div>
              </div>
              <BarChart data={series.map((p) => ({ label: p.date.slice(5), value: p.modActions }))} height={200} />
            </div>

            <div className="card card-pad">
              <div className="card-hd">
                <div className="card-title">
                  <Icon name="shield-alert" /> توزيع العقوبات
                </div>
              </div>
              {data.caseDistribution.length === 0 ? (
                <EmptyState icon="shield-check" title="لا عقوبات" />
              ) : (
                <Donut
                  data={data.caseDistribution.map((c) => ({
                    label: DIST_LABELS[c.type] ?? c.type,
                    value: c.count,
                    color: DIST_COLORS[c.type] ?? 'var(--purple)',
                  }))}
                />
              )}
            </div>

            <div className="card card-pad">
              <div className="card-hd">
                <div className="card-title">
                  <Icon name="crown" /> أكثر المشرفين نشاطًا
                </div>
              </div>
              {data.topModerators.length === 0 ? (
                <EmptyState icon="users" title="لا بيانات" />
              ) : (
                <div className="feed">
                  {data.topModerators.map((m, i) => (
                    <div className="feed-item" key={m.moderatorId}>
                      <div className="feed-ico" style={{ color: 'var(--accent-text)' }}>
                        {i + 1}
                      </div>
                      <div className="feed-body">
                        <div className="ft mono">{m.moderatorId}</div>
                      </div>
                      <span className="badge badge-warn tnum">{fmt(m.count)} إجراء</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
