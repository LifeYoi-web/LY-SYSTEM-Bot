import { useEffect, useState } from 'react';
import { useApplications, useSaveForm, useDeleteForm, usePostAppPanel, type AppForm, type AppFormInput } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, relTime } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';

type QuestionDraft = { label: string; style: string; required: boolean };

const STYLE_OPTIONS = [
  { id: 'short', label: 'سطر' },
  { id: 'paragraph', label: 'فقرة' },
];

const emptyQuestion = (): QuestionDraft => ({ label: '', style: 'short', required: true });

export function Applications() {
  const { data, isLoading } = useApplications();
  const save = useSaveForm();
  const del = useDeleteForm();
  const postPanel = usePostAppPanel();
  const channels = useChannelOptions(['text']);
  const roles = useRoleOptions();

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reviewChannelId, setReviewChannelId] = useState<string | null>(null);
  const [acceptRoleId, setAcceptRoleId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [postChannel, setPostChannel] = useState<string | null>(null);

  useEffect(() => { setPostChannel((c) => c ?? (channels[0]?.id ?? null)); }, [channels]);

  if (isLoading || !data) return <SkeletonRows rows={6} />;

  const resetEditor = () => {
    setEditId(null);
    setName('');
    setDescription('');
    setReviewChannelId(null);
    setAcceptRoleId(null);
    setQuestions([emptyQuestion()]);
  };

  const loadForm = (f: AppForm) => {
    setEditId(f.id);
    setName(f.name);
    setDescription(f.description ?? '');
    setReviewChannelId(f.reviewChannelId);
    setAcceptRoleId(f.acceptRoleId);
    setQuestions(f.questions.length ? f.questions.map((q) => ({ label: q.label, style: q.style, required: q.required })) : [emptyQuestion()]);
  };

  const setQ = (i: number, patch: Partial<QuestionDraft>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const addQ = () => setQuestions((qs) => (qs.length >= 5 ? qs : [...qs, emptyQuestion()]));
  const removeQ = (i: number) => setQuestions((qs) => (qs.length <= 1 ? qs : qs.filter((_, idx) => idx !== i)));

  const saveNow = () => {
    if (!name.trim()) return toast('اسم النموذج مطلوب', 'err');
    if (!questions.some((q) => q.label.trim())) return toast('أضف سؤالًا واحدًا على الأقل', 'err');
    const payload: AppFormInput = {
      id: editId ?? undefined,
      name: name.trim(),
      description: description.trim() || null,
      reviewChannelId,
      acceptRoleId,
      questions: questions.filter((q) => q.label.trim()).map((q) => ({ label: q.label.trim(), style: q.style, required: q.required })),
    };
    save.mutate(payload, {
      onSuccess: () => { toast('تم الحفظ'); resetEditor(); },
      onError: () => toast('فشل الحفظ', 'err'),
    });
  };

  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <p className="page-intro" style={{ margin: 0 }}>نماذج تقديم (إدارة/وايت ليست) عبر زر ومودال، مع مراجعة قبول/رفض داخل ديسكورد.</p>

      {/* forms list */}
      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title"><Icon name="file-text" /> النماذج ({data.forms.length})</div>
          <button className="btn btn-ghost" onClick={resetEditor}><Icon name="plus" /> نموذج جديد</button>
        </div>
        <div className="field"><label>قناة نشر اللوحة</label><Select value={postChannel} onChange={setPostChannel} options={channels} placeholder="اختر قناة" /></div>
        {data.forms.length === 0 ? (
          <EmptyState icon="file-text" title="لا نماذج بعد" sub="أنشئ نموذجًا من المحرّر بالأسفل." />
        ) : (
          <div className="feed">
            {data.forms.map((f) => (
              <div className="feed-item" key={f.id}>
                <div className="feed-ico"><Icon name="scroll" /></div>
                <div className="feed-body"><div className="ft">{f.name}</div><div className="fs">{f.questions.length} سؤال{f.enabled ? '' : ' · معطّل'}</div></div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-subtle" disabled={!postChannel || postPanel.isPending} onClick={() => postChannel && postPanel.mutate({ id: f.id, channelId: postChannel }, { onSuccess: () => toast('تم نشر اللوحة'), onError: () => toast('تعذّر النشر', 'err') })}><Icon name="megaphone" /> نشر</button>
                  <button className="btn btn-ghost" onClick={() => loadForm(f)}><Icon name="settings" /> تحميل</button>
                  <button className="btn btn-ghost" onClick={() => window.confirm(`حذف النموذج «${f.name}»؟`) && del.mutate(f.id, { onSuccess: () => toast('تم الحذف'), onError: () => toast('فشل الحذف', 'err') })}><Icon name="x" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* editor */}
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="settings" /> {editId ? 'تعديل النموذج' : 'نموذج جديد'}</div></div>
        <div className="grid grid-2">
          <div className="field"><label>الاسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="تقديم إدارة" maxLength={80} /></div>
          <div className="field"><label>قناة المراجعة</label><Select value={reviewChannelId} onChange={setReviewChannelId} options={channels} placeholder="اختر قناة" /></div>
        </div>
        <div className="grid grid-2">
          <div className="field"><label>الوصف</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف يظهر في المودال (اختياري)" maxLength={200} /></div>
          <div className="field"><label>رتبة القبول</label><Select value={acceptRoleId} onChange={setAcceptRoleId} options={roles} placeholder="تُمنح عند القبول" /></div>
        </div>

        <div className="card-hd" style={{ marginTop: 6 }}>
          <div className="card-title"><Icon name="message" /> الأسئلة ({questions.length}/5)</div>
          <button className="btn btn-ghost" disabled={questions.length >= 5} onClick={addQ}><Icon name="plus" /> إضافة سؤال</button>
        </div>
        <div className="stack">
          {questions.map((q, i) => (
            <div className="card card-pad" key={i}>
              <div className="field"><label>السؤال {i + 1}</label><input className="input" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder="اكتب السؤال هنا" maxLength={120} /></div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="field" style={{ marginBottom: 0, minWidth: 160 }}><label>النوع</label><Select value={q.style} onChange={(v) => setQ(i, { style: v ?? 'short' })} options={STYLE_OPTIONS} placeholder="سطر" /></div>
                <div className="row" style={{ gap: 12 }}>
                  <Switch checked={q.required} onChange={(v) => setQ(i, { required: v })} label="إجباري" />
                  <button className="btn btn-ghost" disabled={questions.length <= 1} onClick={() => removeQ(i)}><Icon name="x" /> حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" disabled={save.isPending} onClick={saveNow}><Icon name="check" /> حفظ</button>
          {editId && <button className="btn btn-ghost" onClick={resetEditor}><Icon name="rotate-ccw" /> إلغاء</button>}
        </div>
      </div>

      {/* submissions */}
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="users" /> الطلبات ({data.submissions.length})</div></div>
        {data.submissions.length === 0 ? (
          <EmptyState icon="users" title="لا طلبات بعد" sub="الطلبات الواردة تظهر هنا." />
        ) : (
          <div className="feed">
            {data.submissions.map((s) => (
              <div className="feed-item" key={s.id}>
                <div className="feed-ico"><Icon name="file-text" /></div>
                <div className="feed-body"><div className="ft mono">{s.userId}</div><div className="fs">{s.status} · {relTime(s.createdAt)}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
