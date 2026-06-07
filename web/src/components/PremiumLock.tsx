import { Icon } from '../lib/icons';

export function PremiumLock({
  feature,
  ent,
}: {
  feature: string;
  ent: { features: Record<string, boolean> } | null;
}) {
  if (!ent || ent.features[feature] !== false) return null;

  return (
    <div
      style={{
        background: 'rgba(245,124,0,0.08)',
        border: '1px solid #f57c00',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ color: '#f57c00', flexShrink: 0 }}>
        <Icon name="lock" size={20} />
      </span>
      <div style={{ flex: 1 }}>
        <strong>ميزة بريميوم</strong>
        <div style={{ opacity: 0.75, fontSize: 13, marginTop: 2 }}>
          هذه الميزة متاحة في باقة بريميوم — رقِّ سيرفرك لفتحها.
        </div>
      </div>
      <span
        style={{
          color: '#f57c00',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Icon name="sparkles" size={16} />
        ترقية
      </span>
    </div>
  );
}
