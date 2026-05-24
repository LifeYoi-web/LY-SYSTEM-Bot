import { useState } from 'react';
import { useStatCounters, useCreateStatCounter, useDeleteStatCounter } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, EmptyState, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

const TYPES = [
  { v: 'members', label: 'كل الأعضاء' },
  { v: 'humans', label: 'البشر فقط' },
  { v: 'bots', label: 'البوتات' },
  { v: 'roles', label: 'الرتب' },
  { v: 'channels', label: 'القنوات' },
  { v: 'boosts', label: 'البوستات' },
];

export function StatCounters() {
  const { data, isLoading } = useStatCounters();
  const create = useCreateStatCounter();
  const del = useDeleteStatCounter();
  const voiceChannels = useChannelOptions(['voice', 'text']);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [type, setType] = useState('members');
  const [template, setTemplate] = useState('{name}: {count}');
  const chName = (id: string) => voiceChannels.find((c) => c.id === id)?.label ?? id;

  function add() {
    if (!channelId) return toast('اختر قناة', 'err');
    create.mutate({ channelId, type, template: template || '{name}: {count}' }, { onSuccess: () => toast('تمت الإضافة — يتحدّث الاسم خلال دقائق'), onError: () => toast('فشل', 'err') });
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="page-intro" style={{ margin: 0 }}>قنوات (يفضّل صوتية) تتحدّث أسماؤها تلقائيًا بالإحصائيات. متغيّرات: {'{count}'} و {'{name}'}.</p>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="bar-chart" /> عدّاد جديد</div></div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}><label>القناة</label><Select value={channelId} onChange={setChannelId} options={voiceChannels} placeholder="اختر قناة" /></div>
          <div className="field" style={{ flex: '0 0 170px' }}>
            <label>النوع</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}><label>القالب</label><input className="input" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="{name}: {count}" /></div>
        <button className="btn btn-primary" disabled={create.isPending} onClick={add}><Icon name="plus" /> إضافة</button>
      </div>
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : !data || data.counters.length === 0 ? (
        <div className="card"><EmptyState icon="bar-chart" title="لا عدّادات" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>القناة</th><th>النوع</th><th>القالب</th><th></th></tr></thead>
              <tbody>
                {data.counters.map((c) => (
                  <tr key={c.id}>
                    <td>{chName(c.channelId)}</td>
                    <td><span className="badge badge-mute">{TYPES.find((t) => t.v === c.type)?.label ?? c.type}</span></td>
                    <td className="mono">{c.template}</td>
                    <td><button className="icon-btn" onClick={() => del.mutate(c.id)} aria-label="حذف"><Icon name="trash" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
