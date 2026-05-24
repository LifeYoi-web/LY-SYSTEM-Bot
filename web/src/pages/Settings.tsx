import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, apiPut } from '../lib/api';

interface GuildSettings {
  guildId: string;
  logChannelId: string | null;
  staffRoleIds: string[];
}

export function Settings() {
  const { data } = useQuery<GuildSettings>({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const [logChannelId, setLogChannelId] = useState('');
  const [staffRoles, setStaffRoles] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setLogChannelId(data.logChannelId ?? '');
      setStaffRoles(data.staffRoleIds.join(', '));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiPut('/settings', {
        logChannelId: logChannelId.trim() || null,
        staffRoleIds: staffRoles.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    },
  });

  return (
    <div className="card card-pad" style={{ maxWidth: 580 }}>
      <h2 className="card-title">⚙️ إعدادات السيرفر</h2>
      <div className="field">
        <label>قناة السجلّات (Channel ID)</label>
        <input
          className="input"
          value={logChannelId}
          onChange={(e) => setLogChannelId(e.target.value)}
          placeholder="مثال: 123456789012345678"
        />
        <div className="hint">القناة اللي تنكتب فيها سجلّات الأحداث.</div>
      </div>
      <div className="field">
        <label>رتب الإدارة (Role IDs مفصولة بفاصلة)</label>
        <input
          className="input"
          value={staffRoles}
          onChange={(e) => setStaffRoles(e.target.value)}
          placeholder="roleId1, roleId2"
        />
        <div className="hint">أصحاب هذي الرتب يقدرون يدخلون اللوحة (بالإضافة لمن عنده صلاحية Administrator / Manage Guild).</div>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? '...' : 'حفظ التغييرات'}
        </button>
        {saved && <span className="toast">تم الحفظ ✓</span>}
        {save.isError && <span className="err-text">فشل الحفظ</span>}
      </div>
    </div>
  );
}
