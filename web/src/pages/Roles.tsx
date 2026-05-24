import { useState } from 'react';
import { useRolePanels, useSaveRolePanel, useDeleteRolePanel, usePostRolePanel } from '../lib/hooks';
import type { PanelRole, RolePanel } from '../lib/types';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, toast } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

function PanelCard({ panel, roleName }: { panel: RolePanel; roleName: (id: string) => string }) {
  const channels = useChannelOptions(['text', 'announcement']);
  const post = usePostRolePanel();
  const del = useDeleteRolePanel();
  const [channelId, setChannelId] = useState<string | null>(panel.channelId);

  return (
    <div className="card card-pad">
      <div className="between">
        <div className="card-title"><Icon name="at-sign" /> {panel.title}</div>
        <button className="icon-btn" onClick={() => del.mutate(panel.id, { onSuccess: () => toast('تم حذف اللوحة') })} aria-label="حذف"><Icon name="trash" /></button>
      </div>
      {panel.description && <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>{panel.description}</p>}
      <div className="chips" style={{ marginTop: 12 }}>
        {panel.roles.map((r) => (
          <span className="role-pill" key={r.roleId}><span className="dot" />{r.label || roleName(r.roleId)}</span>
        ))}
      </div>
      <div className="field-row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>القناة</label>
          <Select value={channelId} onChange={setChannelId} options={channels} placeholder="اختر قناة" />
        </div>
        <button
          className="btn btn-primary"
          disabled={!channelId || post.isPending}
          onClick={() => channelId && post.mutate({ id: panel.id, channelId }, { onSuccess: () => toast('تم نشر اللوحة في القناة'), onError: () => toast('تعذّر النشر — تحقق من صلاحيات البوت', 'err') })}
        >
          <Icon name="megaphone" /> {panel.messageId ? 'إعادة النشر' : 'نشر'}
        </button>
      </div>
      {panel.messageId && <div className="ok-text" style={{ marginTop: 8 }}>منشورة ✓</div>}
    </div>
  );
}

export function Roles() {
  const { data, isLoading } = useRolePanels();
  const save = useSaveRolePanel();
  const roles = useRoleOptions();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<PanelRole[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.label ?? id;

  function addRole(id: string | null) {
    if (!id || draft.some((r) => r.roleId === id)) return;
    if (draft.length >= 25) return toast('الحد الأقصى 25 رتبة للوحة', 'err');
    setDraft([...draft, { roleId: id, label: roleName(id) }]);
    setPick(null);
  }
  function create() {
    if (!title.trim()) return toast('أدخل عنوانًا', 'err');
    if (draft.length === 0) return toast('أضف رتبة واحدة على الأقل', 'err');
    save.mutate(
      { title: title.trim(), description: description.trim() || undefined, roles: draft },
      { onSuccess: () => { toast('تم إنشاء اللوحة'); setTitle(''); setDescription(''); setDraft([]); }, onError: () => toast('فشل الإنشاء', 'err') },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <p className="page-intro" style={{ margin: 0 }}>أنشئ لوحة أزرار يضغطها الأعضاء لأخذ/إزالة رتب بأنفسهم.</p>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="plus" /> لوحة جديدة</div></div>
        <div className="field"><label>العنوان</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: اختر رتبك" /></div>
        <div className="field"><label>الوصف (اختياري)</label><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اضغط على الزر لأخذ الرتبة..." /></div>
        <div className="field" style={{ marginBottom: draft.length ? 12 : 0 }}>
          <label>الرتب ({draft.length}/25)</label>
          <Select value={pick} onChange={addRole} options={roles.filter((r) => !draft.some((d) => d.roleId === r.id))} placeholder="+ أضف رتبة" />
        </div>
        {draft.length > 0 && (
          <div className="chips" style={{ marginBottom: 16 }}>
            {draft.map((r) => (
              <span className="chip" key={r.roleId}>{r.label}<button onClick={() => setDraft(draft.filter((x) => x.roleId !== r.roleId))} aria-label="إزالة"><Icon name="x" /></button></span>
            ))}
          </div>
        )}
        <button className="btn btn-primary" disabled={save.isPending} onClick={create}><Icon name="check" /> إنشاء اللوحة</button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data || data.panels.length === 0 ? (
        <div className="card"><EmptyState icon="at-sign" title="لا لوحات رتب بعد" sub="أنشئ واحدة من الأعلى ثم انشرها في قناة." /></div>
      ) : (
        <div className="grid grid-2">
          {data.panels.map((p) => <PanelCard key={p.id} panel={p} roleName={roleName} />)}
        </div>
      )}
    </div>
  );
}
