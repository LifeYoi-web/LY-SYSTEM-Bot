import { useState } from 'react';
import { useModAction, type ModActionBody } from '../lib/hooks';
import { Modal, toast } from './ui';
import { Icon, type IconName } from '../lib/icons';

type Kind = 'warn' | 'mute' | 'kick' | 'ban';
const KINDS: { k: Kind; label: string; icon: IconName }[] = [
  { k: 'warn', label: 'تحذير', icon: 'alert-triangle' },
  { k: 'mute', label: 'كتم', icon: 'volume-x' },
  { k: 'kick', label: 'طرد', icon: 'user-x' },
  { k: 'ban', label: 'حظر', icon: 'ban' },
];

export function ActionModal({
  member,
  initialKind = 'warn',
  onClose,
}: {
  member: { id: string; displayName: string; isBot?: boolean };
  initialKind?: Kind;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(10);
  const action = useModAction();

  function submit() {
    const body: ModActionBody = { kind, userId: member.id, reason: reason.trim() || undefined };
    if (kind === 'mute') body.seconds = Math.max(60, Math.round(minutes * 60));
    action.mutate(body, {
      onSuccess: () => {
        toast(`تم تنفيذ الإجراء على ${member.displayName}`);
        onClose();
      },
      onError: () => toast('فشل تنفيذ الإجراء — تأكد من صلاحيات البوت', 'err'),
    });
  }

  return (
    <Modal
      title={`إجراء على ${member.displayName}`}
      sub="يُسجَّل الإجراء تلقائيًا في سجل العقوبات."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-subtle" onClick={onClose}>
            إلغاء
          </button>
          <button
            className={`btn ${kind === 'ban' || kind === 'kick' ? 'btn-danger' : 'btn-primary'}`}
            disabled={action.isPending}
            onClick={submit}
          >
            {action.isPending ? '...' : 'تأكيد'}
          </button>
        </>
      }
    >
      <div className="seg" style={{ width: '100%', marginBottom: 18 }}>
        {KINDS.map((x) => (
          <button
            key={x.k}
            className={kind === x.k ? 'on' : ''}
            style={{ flex: 1 }}
            disabled={member.isBot && x.k !== 'ban'}
            onClick={() => setKind(x.k)}
          >
            <Icon name={x.icon} size={14} /> {x.label}
          </button>
        ))}
      </div>
      {kind === 'mute' && (
        <div className="field">
          <label>مدة الكتم (بالدقائق)</label>
          <input
            className="input tnum"
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </div>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>السبب</label>
        <textarea
          className="textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="اكتب سبب الإجراء (اختياري)..."
        />
      </div>
    </Modal>
  );
}
