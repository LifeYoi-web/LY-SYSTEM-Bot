import { useEffect, useState } from 'react';
import { useSettings, useUpdateSettings, useOverview } from '../lib/hooks';
import type { Settings } from '../lib/types';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

const DEFAULT_WELCOME = 'أهلًا وسهلًا {user} في {server}! 🎉 صرت العضو رقم {memberCount}.';
const DEFAULT_GOODBYE = 'وداعًا {username} 👋 — صار عدد الأعضاء {memberCount}.';

function render(tpl: string, server: string, count: number) {
  return tpl
    .split('{user}').join('@أحمد')
    .split('{username}').join('أحمد')
    .split('{server}').join(server)
    .split('{memberCount}').join(String(count))
    .split('{count}').join(String(count));
}

export function Welcome() {
  const { data, isLoading } = useSettings();
  const ov = useOverview();
  const save = useUpdateSettings();
  const channels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<Settings | null>(null);

  useEffect(() => {
    if (data) setD(data);
  }, [data]);

  if (isLoading || !d) return <SkeletonRows rows={6} />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setD({ ...d, [k]: v });
  const serverName = ov.data?.name ?? 'سيرفرك';
  const count = ov.data?.memberCount ?? 100;

  function submit() {
    if (!d) return;
    save.mutate(
      {
        welcomeEnabled: d.welcomeEnabled,
        welcomeChannelId: d.welcomeChannelId,
        welcomeMessage: d.welcomeMessage,
        goodbyeEnabled: d.goodbyeEnabled,
        goodbyeMessage: d.goodbyeMessage,
        autoRoleId: d.autoRoleId,
      },
      { onSuccess: () => toast('تم حفظ إعدادات الترحيب'), onError: () => toast('فشل الحفظ', 'err') },
    );
  }

  const previewText = render(d.welcomeMessage || DEFAULT_WELCOME, serverName, count);

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="grid grid-2">
        <div className="stack">
          <div className="card card-pad">
            <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
              <div>
                <div className="tr-title" style={{ fontSize: 15 }}>رسالة الترحيب</div>
                <div className="tr-sub">تُرسل عند انضمام عضو جديد.</div>
              </div>
              <Switch checked={d.welcomeEnabled} onChange={(v) => set('welcomeEnabled', v)} label="تفعيل الترحيب" />
            </div>
          </div>

          <div className="card card-pad" style={{ opacity: d.welcomeEnabled ? 1 : 0.55, pointerEvents: d.welcomeEnabled ? 'auto' : 'none' }}>
            <div className="field">
              <label>قناة الترحيب</label>
              <Select value={d.welcomeChannelId} onChange={(v) => set('welcomeChannelId', v)} options={channels} placeholder="اختر قناة" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>نص الترحيب</label>
              <textarea
                className="textarea"
                value={d.welcomeMessage ?? ''}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                placeholder={DEFAULT_WELCOME}
              />
              <div className="hint">متغيّرات: {'{user}'} • {'{username}'} • {'{server}'} • {'{memberCount}'}</div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-hd">
              <div className="card-title">
                <Icon name="eye" /> معاينة حيّة
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--bg-2)', borderRadius: 12, borderInlineStart: '3px solid var(--accent)' }}>
              <div className="avatar" style={{ background: 'var(--grad-accent)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  LY-SYSTEM <span className="tag-bot">BOT</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.6 }}>{previewText}</div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-hd">
              <div className="card-title">
                <Icon name="at-sign" /> رتبة تلقائية
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>تُمنح لكل عضو جديد</label>
              <Select value={d.autoRoleId} onChange={(v) => set('autoRoleId', v)} options={roles} placeholder="بدون رتبة تلقائية" />
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="toggle-row" style={{ padding: 0, border: 'none', marginBottom: d.goodbyeEnabled ? 16 : 0 }}>
          <div>
            <div className="tr-title" style={{ fontSize: 15 }}>رسالة الوداع</div>
            <div className="tr-sub">تُرسل في قناة الترحيب عند مغادرة عضو.</div>
          </div>
          <Switch checked={d.goodbyeEnabled} onChange={(v) => set('goodbyeEnabled', v)} label="تفعيل الوداع" />
        </div>
        {d.goodbyeEnabled && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>نص الوداع</label>
            <textarea
              className="textarea"
              value={d.goodbyeMessage ?? ''}
              onChange={(e) => set('goodbyeMessage', e.target.value)}
              placeholder={DEFAULT_GOODBYE}
            />
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>
          <Icon name="check" /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>
    </div>
  );
}
