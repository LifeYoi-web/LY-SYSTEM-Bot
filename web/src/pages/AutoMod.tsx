import { useEffect, useState } from 'react';
import { useAutoMod, useUpdateAutoMod } from '../lib/hooks';
import type { AutoMod as AutoModT } from '../lib/types';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast, clampInt } from '../components/ui';
import { ChipsInput, MultiSelect, useChannelOptions, useRoleOptions } from '../components/pickers';

const ACTIONS: { v: string; label: string }[] = [
  { v: 'delete', label: 'حذف الرسالة فقط' },
  { v: 'warn', label: 'حذف + تحذير' },
  { v: 'mute', label: 'حذف + كتم' },
  { v: 'kick', label: 'حذف + طرد' },
  { v: 'ban', label: 'حذف + حظر' },
];

export function AutoMod() {
  const { data, isLoading } = useAutoMod();
  const save = useUpdateAutoMod();
  const channels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<AutoModT | null>(null);

  useEffect(() => {
    if (data) setD(data);
  }, [data]);

  if (isLoading || !d) return <SkeletonRows rows={6} />;

  const set = <K extends keyof AutoModT>(k: K, v: AutoModT[K]) => setD({ ...d, [k]: v });

  function submit() {
    if (!d) return;
    save.mutate(
      {
        enabled: d.enabled,
        antiSpam: d.antiSpam,
        antiInvite: d.antiInvite,
        antiLink: d.antiLink,
        bannedWords: d.bannedWords,
        maxMentions: d.maxMentions,
        actionOnViolation: d.actionOnViolation,
        muteSeconds: d.muteSeconds,
        ignoredChannelIds: d.ignoredChannelIds,
        ignoredRoleIds: d.ignoredRoleIds,
      },
      {
        onSuccess: () => toast('تم حفظ إعدادات الحماية'),
        onError: () => toast('فشل الحفظ', 'err'),
      },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card card-pad" style={{ borderColor: d.enabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row">
            <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}>
              <Icon name="shield-alert" />
            </div>
            <div>
              <div className="tr-title" style={{ fontSize: 16 }}>الحماية التلقائية</div>
              <div className="tr-sub">تفعيل النظام الكامل لمراقبة الرسائل واتخاذ الإجراءات.</div>
            </div>
          </div>
          <Switch checked={d.enabled} onChange={(v) => set('enabled', v)} label="تفعيل الحماية" />
        </div>
      </div>

      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="card-hd">
          <div className="card-title">
            <Icon name="shield" /> قواعد المراقبة
          </div>
        </div>
        <Toggle title="مكافحة السبام" sub="حذف الرسائل المتكررة بسرعة من نفس العضو." v={d.antiSpam} on={(v) => set('antiSpam', v)} />
        <Toggle title="منع روابط الدعوات" sub="حظر روابط discord.gg ودعوات السيرفرات." v={d.antiInvite} on={(v) => set('antiInvite', v)} />
        <Toggle title="منع الروابط الخارجية" sub="حذف أي رابط http/https في الرسائل." v={d.antiLink} on={(v) => set('antiLink', v)} />

        <div className="field" style={{ marginTop: 18 }}>
          <label>الكلمات المحظورة</label>
          <ChipsInput value={d.bannedWords} onChange={(v) => set('bannedWords', v)} />
          <div className="hint">أي رسالة تحتوي إحدى هذه الكلمات سيُتّخذ بشأنها الإجراء.</div>
        </div>

        <div className="field-row" style={{ marginTop: 8 }}>
          <div className="field">
            <label>الحد الأقصى للإشارات (Mentions)</label>
            <input
              className="input tnum"
              type="number"
              min={1}
              max={50}
              value={d.maxMentions}
              onChange={(e) => set('maxMentions', clampInt(e.target.value, 1, 50))}
            />
          </div>
          <div className="field">
            <label>الإجراء عند المخالفة</label>
            <select className="select" value={d.actionOnViolation} onChange={(e) => set('actionOnViolation', e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a.v} value={a.v}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {d.actionOnViolation === 'mute' && (
          <div className="field">
            <label>مدة الكتم (بالثواني)</label>
            <input
              className="input tnum"
              type="number"
              min={1}
              value={d.muteSeconds}
              onChange={(e) => set('muteSeconds', clampInt(e.target.value, 1, 2_419_200))}
            />
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ opacity: d.enabled ? 1 : 0.55, pointerEvents: d.enabled ? 'auto' : 'none' }}>
        <div className="card-hd">
          <div className="card-title">
            <Icon name="eye" /> الاستثناءات
          </div>
        </div>
        <div className="field">
          <label>قنوات مستثناة</label>
          <MultiSelect value={d.ignoredChannelIds} onChange={(v) => set('ignoredChannelIds', v)} options={channels} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>رتب مستثناة</label>
          <MultiSelect value={d.ignoredRoleIds} onChange={(v) => set('ignoredRoleIds', v)} options={roles} />
          <div className="hint">المشرفون (صلاحية إدارة الرسائل) مستثنون تلقائيًا.</div>
        </div>
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>
          <Icon name="check" /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  );
}

function Toggle({ title, sub, v, on }: { title: string; sub: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div>
        <div className="tr-title">{title}</div>
        <div className="tr-sub">{sub}</div>
      </div>
      <Switch checked={v} onChange={on} label={title} />
    </div>
  );
}
