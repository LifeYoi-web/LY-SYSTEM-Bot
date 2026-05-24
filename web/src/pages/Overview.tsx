import { type CSSProperties } from 'react';
import { useOverview, useAnalytics } from '../lib/hooks';
import { AreaChart, Donut, Sparkline } from '../components/charts';
import { fmt, relTime, EmptyState, SkeletonRows } from '../components/ui';
import { Icon, type IconName } from '../lib/icons';
import { logMeta, logText } from '../lib/logmeta';

function trendPct(values: number[]): number {
  if (values.length < 4) return 0;
  const half = Math.floor(values.length / 2);
  const prev = values.slice(0, half).reduce((a, b) => a + b, 0);
  const recent = values.slice(half).reduce((a, b) => a + b, 0);
  if (prev === 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prev) / prev) * 100);
}

function Kpi({
  icon,
  value,
  label,
  spark,
  trend,
  glow,
}: {
  icon: IconName;
  value: string;
  label: string;
  spark?: number[];
  trend?: number;
  glow?: string;
}) {
  const dir = trend == null ? null : trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat';
  return (
    <div className="kpi" style={glow ? ({ ['--ico-glow' as string]: glow } as CSSProperties) : undefined}>
      <div className="kpi-top">
        <div className="kpi-ico" style={glow ? { background: glow } : undefined}>
          <Icon name={icon} />
        </div>
        {dir && (
          <span className={`kpi-trend ${dir}`}>
            <Icon name={dir === 'up' ? 'trending-up' : dir === 'down' ? 'trending-down' : 'minus'} />
            {Math.abs(trend!)}%
          </span>
        )}
      </div>
      <div className="kpi-value tnum">{value}</div>
      <div className="kpi-label">{label}</div>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

const DIST_COLORS: Record<string, string> = {
  ban: 'var(--danger)',
  kick: 'var(--warn)',
  mute: 'var(--info)',
  warn: 'var(--accent)',
};
const DIST_LABELS: Record<string, string> = { ban: 'حظر', kick: 'طرد', mute: 'كتم', warn: 'تحذير' };

export function Overview() {
  const ov = useOverview();
  const an = useAnalytics(14);

  if (ov.isLoading) return <SkeletonRows rows={5} />;
  if (ov.error || !ov.data) return <p className="err-text">تعذّر تحميل البيانات.</p>;

  const d = ov.data;
  const series = an.data?.series ?? [];
  const labels = series.map((p) => p.date.slice(5));
  const messages = series.map((p) => p.messages);
  const joins = series.map((p) => p.joins);
  const memberSeries = series.map((p) => p.memberCount);

  const dist = (an.data?.caseDistribution ?? []).map((c) => ({
    label: DIST_LABELS[c.type] ?? c.type,
    value: c.count,
    color: DIST_COLORS[c.type] ?? 'var(--purple)',
  }));

  return (
    <div className="stack">
      <p className="page-intro">
        أهلًا فيك في لوحة تحكم <b style={{ color: 'var(--text)' }}>{d.name}</b> 👋
      </p>

      <div className="kpi-grid">
        <Kpi
          icon="users"
          value={fmt(d.memberCount)}
          label={`${fmt(d.humanCount)} عضو • ${fmt(d.botCount)} بوت`}
          spark={memberSeries.some((v) => v > 0) ? memberSeries : undefined}
          glow="rgba(245,124,0,0.18)"
        />
        <Kpi icon="message" value={fmt(d.todayMessages)} label="رسائل اليوم" spark={messages} trend={trendPct(messages)} glow="rgba(91,155,243,0.16)" />
        <Kpi icon="user-plus" value={fmt(d.todayJoins)} label="انضمامات اليوم" spark={joins} trend={trendPct(joins)} glow="rgba(54,196,111,0.16)" />
        <Kpi icon="shield" value={fmt(d.activeCases)} label={`من ${fmt(d.totalCases)} عقوبة إجمالًا`} glow="rgba(240,73,79,0.16)" />
      </div>

      <div className="grid grid-2">
        <div className="card card-pad span-2">
          <div className="card-hd">
            <div className="card-title">
              <Icon name="activity" /> النشاط آخر ١٤ يوم
            </div>
            <div className="chart-legend">
              <span className="lg">
                <span className="sw" style={{ background: 'var(--accent)' }} /> الرسائل
              </span>
              <span className="lg">
                <span className="sw" style={{ background: 'var(--info)' }} /> الانضمامات
              </span>
            </div>
          </div>
          {an.isLoading ? (
            <SkeletonRows rows={3} />
          ) : (
            <AreaChart
              labels={labels}
              series={[
                { name: 'الرسائل', color: 'var(--accent)', values: messages },
                { name: 'الانضمامات', color: 'var(--info)', values: joins },
              ]}
            />
          )}
        </div>

        <div className="card card-pad">
          <div className="card-hd">
            <div className="card-title">
              <Icon name="shield" /> توزيع العقوبات
            </div>
          </div>
          {dist.length === 0 ? (
            <EmptyState icon="shield-check" title="لا عقوبات بعد" sub="السيرفر نظيف ✨" />
          ) : (
            <Donut data={dist} />
          )}
        </div>

        <div className="card card-pad">
          <div className="card-hd">
            <div className="card-title">
              <Icon name="grid" /> لمحة عن السيرفر
            </div>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            <Fact icon="hash" label="القنوات" value={fmt(d.channelCount)} />
            <Fact icon="at-sign" label="الرتب" value={fmt(d.roleCount)} />
            <Fact icon="sparkles" label="مستوى البوست" value={`Level ${d.boostLevel} • ${fmt(d.boostCount)}`} />
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="activity" /> آخر الأحداث
          </div>
        </div>
        {d.recentLogs.length === 0 ? (
          <EmptyState icon="scroll" title="لا أحداث بعد" sub="ستظهر هنا أحداث السيرفر فور حدوثها." />
        ) : (
          <div className="feed">
            {d.recentLogs.map((log) => {
              const m = logMeta(log.type);
              return (
                <div className="feed-item" key={log.id}>
                  <div className="feed-ico">
                    <Icon name={m.icon} />
                  </div>
                  <div className="feed-body">
                    <div className="ft">{logText(log)}</div>
                    <div className="fs">{relTime(log.createdAt)}</div>
                  </div>
                  <span className={`badge ${m.cls}`}>{m.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="toggle-row">
      <div className="row">
        <div className="feed-ico">
          <Icon name={icon} />
        </div>
        <span className="tr-title">{label}</span>
      </div>
      <span className="tnum" style={{ fontWeight: 800 }}>
        {value}
      </span>
    </div>
  );
}
