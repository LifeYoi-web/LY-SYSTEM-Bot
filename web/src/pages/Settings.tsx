import { useEffect, useState } from 'react';
import { useSettings, useUpdateSettings } from '../lib/hooks';
import type { Settings as SettingsT } from '../lib/types';
import { Icon } from '../lib/icons';
import { SkeletonRows, toast, clampInt } from '../components/ui';
import { Select, MultiSelect, useChannelOptions, useRoleOptions } from '../components/pickers';

export function Settings() {
  const { data, isLoading } = useSettings();
  const save = useUpdateSettings();
  const channels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<SettingsT | null>(null);

  useEffect(() => {
    if (data) setD(data);
  }, [data]);

  if (isLoading || !d) return <SkeletonRows rows={5} />;
  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setD({ ...d, [k]: v });

  function submit() {
    if (!d) return;
    save.mutate(
      {
        language: d.language,
        logChannelId: d.logChannelId,
        staffRoleIds: d.staffRoleIds,
        minAccountAgeDays: d.minAccountAgeDays,
        altGateAction: d.altGateAction,
        quarantineRoleId: d.quarantineRoleId,
      },
      { onSuccess: () => toast('تم حفظ الإعدادات'), onError: () => toast('فشل الحفظ', 'err') },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="globe" /> اللغة
          </div>
        </div>
        <div className="seg">
          <button className={d.language === 'ar' ? 'on' : ''} onClick={() => set('language', 'ar')}>
            العربية
          </button>
          <button className={d.language === 'en' ? 'on' : ''} onClick={() => set('language', 'en')}>
            English
          </button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="scroll" /> قناة السجلّات
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>القناة التي تُنشر فيها أحداث السيرفر</label>
          <Select value={d.logChannelId} onChange={(v) => set('logChannelId', v)} options={channels} placeholder="بدون قناة سجلّات" />
          <div className="hint">تشمل الإجراءات الإشرافية، حالات الحماية، حذف الرسائل، والانضمام/المغادرة.</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="users" /> رتب الإدارة
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>الرتب التي يُسمح لها بدخول لوحة التحكم</label>
          <MultiSelect value={d.staffRoleIds} onChange={(v) => set('staffRoleIds', v)} options={roles} />
          <div className="hint">بالإضافة إلى من يملك صلاحية Administrator أو Manage Guild.</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="shield-alert" /> بوابة عمر الحساب (كشف الحسابات الوهمية)
          </div>
        </div>
        <div className="field">
          <label>الحد الأدنى لعمر الحساب (بالأيام، 0 = إيقاف)</label>
          <input
            className="input tnum"
            type="number"
            min={0}
            max={365}
            value={d.minAccountAgeDays}
            onChange={(e) => set('minAccountAgeDays', clampInt(e.target.value, 0, 365))}
          />
          <div className="hint">الحسابات الأحدث من هذا العمر تُعامَل حسب الإجراء أدناه عند الانضمام.</div>
        </div>
        {d.minAccountAgeDays > 0 && (
          <>
            <div className="field">
              <label>الإجراء</label>
              <select className="select" value={d.altGateAction} onChange={(e) => set('altGateAction', e.target.value)}>
                <option value="alert">تنبيه الإدارة فقط</option>
                <option value="quarantine">منح رتبة حجر صحي</option>
                <option value="kick">طرد العضو</option>
              </select>
            </div>
            {d.altGateAction === 'quarantine' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>رتبة الحجر الصحي</label>
                <Select value={d.quarantineRoleId} onChange={(v) => set('quarantineRoleId', v)} options={roles} placeholder="اختر رتبة" />
              </div>
            )}
          </>
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
