import { useState } from 'react';
import {
  useEmbeds,
  useSaveEmbed,
  useDeleteEmbed,
  usePostEmbed,
  type EmbedPayload,
  type EmbedField,
  type EmbedLinkButton,
} from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function EmbedBuilder() {
  const { data, isLoading } = useEmbeds();
  const save = useSaveEmbed();
  const del = useDeleteEmbed();
  const post = usePostEmbed();
  const channels = useChannelOptions(['text', 'announcement']);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [p, setP] = useState<EmbedPayload>({});
  const [postChannel, setPostChannel] = useState<string | null>(null);

  const set = <K extends keyof EmbedPayload>(k: K, v: EmbedPayload[K]) => setP({ ...p, [k]: v });

  function resetEditor() {
    setEditId(null);
    setName('');
    setP({});
  }

  function loadEmbed(id: string, n: string, payload: EmbedPayload) {
    setEditId(id);
    setName(n);
    setP(payload ?? {});
  }

  const fields: EmbedField[] = p.fields ?? [];
  const buttons: EmbedLinkButton[] = p.buttons ?? [];

  function setField(i: number, patch: Partial<EmbedField>) {
    set('fields', fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addField() {
    set('fields', [...fields, { name: '', value: '', inline: false }]);
  }
  function removeField(i: number) {
    set('fields', fields.filter((_, idx) => idx !== i));
  }

  function setButton(i: number, patch: Partial<EmbedLinkButton>) {
    set('buttons', buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addButton() {
    if (buttons.length >= 5) return toast('الحد الأقصى 5 أزرار', 'err');
    set('buttons', [...buttons, { label: '', url: '' }]);
  }
  function removeButton(i: number) {
    set('buttons', buttons.filter((_, idx) => idx !== i));
  }

  function doSave() {
    if (!name.trim()) return toast('أدخل اسم القالب', 'err');
    if (!p.title && !p.description && fields.length === 0) return toast('أضف عنواناً أو وصفاً أو حقولاً', 'err');
    save.mutate(
      { id: editId ?? undefined, name: name.trim(), payload: p },
      {
        onSuccess: () => toast('تم الحفظ'),
        onError: () => toast('فشل — تأكد من الاسم والمحتوى', 'err'),
      },
    );
  }

  function doPost() {
    if (!editId) return toast('احفظ القالب أولاً', 'err');
    if (!postChannel) return toast('اختر قناة', 'err');
    post.mutate(
      { id: editId, channelId: postChannel },
      {
        onSuccess: () => toast('تم النشر'),
        onError: () => toast('تعذّر النشر — تحقق من صلاحيات البوت', 'err'),
      },
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <p className="page-intro" style={{ margin: 0 }}>مصمّم إمبد كامل: احفظ القوالب وانشرها أو عدّل رسالة منشورة.</p>
      <div className="grid grid-2">
        {/* ---------------------------------------------------- saved list */}
        <div className="card card-pad">
          <div className="card-hd">
            <div className="card-title"><Icon name="file-text" /> القوالب المحفوظة</div>
            <button className="btn btn-subtle" onClick={resetEditor}><Icon name="plus" /> embed جديد</button>
          </div>
          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : !data || data.embeds.length === 0 ? (
            <EmptyState icon="file-text" title="لا قوالب بعد" sub="أنشئ أول قالب من المحرّر." />
          ) : (
            <div className="feed">
              {data.embeds.map((e) => (
                <div className="feed-item" key={e.id}>
                  <div className="feed-ico"><Icon name="file-text" /></div>
                  <div className="feed-body">
                    <div className="ft">{e.name}</div>
                    {e.postedMessageId && <div className="fs">منشور</div>}
                  </div>
                  <div className="row">
                    <button className="btn btn-ghost" onClick={() => loadEmbed(e.id, e.name, e.payload)}><Icon name="copy" /> تحميل</button>
                    <button className="btn btn-subtle" disabled={del.isPending} onClick={() => del.mutate(e.id, { onSuccess: () => { if (editId === e.id) resetEditor(); } })} aria-label="حذف"><Icon name="x" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- editor */}
        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="sparkles" /> {editId ? 'تعديل القالب' : 'قالب جديد'}</div></div>

          <div className="field"><label>الاسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم القالب" /></div>
          <div className="field"><label>العنوان</label><input className="input" value={p.title ?? ''} onChange={(e) => set('title', e.target.value || undefined)} /></div>
          <div className="field"><label>الوصف</label><textarea className="textarea" rows={4} value={p.description ?? ''} onChange={(e) => set('description', e.target.value || undefined)} /></div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}><label>اللون</label><input className="input" value={p.color ?? ''} onChange={(e) => set('color', e.target.value || undefined)} placeholder="#f57c00" /></div>
            <div className="field" style={{ flex: 1 }}><label>المؤلف</label><input className="input" value={p.author ?? ''} onChange={(e) => set('author', e.target.value || undefined)} /></div>
          </div>
          <div className="field"><label>التذييل</label><input className="input" value={p.footer ?? ''} onChange={(e) => set('footer', e.target.value || undefined)} /></div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}><label>رابط صورة</label><input className="input" value={p.image ?? ''} onChange={(e) => set('image', e.target.value || undefined)} placeholder="https://..." /></div>
            <div className="field" style={{ flex: 1 }}><label>صورة مصغّرة</label><input className="input" value={p.thumbnail ?? ''} onChange={(e) => set('thumbnail', e.target.value || undefined)} placeholder="https://..." /></div>
          </div>

          {/* fields */}
          <div className="card-hd" style={{ marginTop: 18 }}>
            <div className="card-title"><Icon name="hash" /> الحقول</div>
            <button className="btn btn-subtle" onClick={addField}><Icon name="plus" /> حقل</button>
          </div>
          {fields.map((f, i) => (
            <div className="field-row" key={i} style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}><label>الاسم</label><input className="input" value={f.name} onChange={(e) => setField(i, { name: e.target.value })} /></div>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}><label>القيمة</label><input className="input" value={f.value} onChange={(e) => setField(i, { value: e.target.value })} /></div>
              <Switch checked={!!f.inline} onChange={(v) => setField(i, { inline: v })} label="بالعرض" />
              <button className="btn btn-subtle" onClick={() => removeField(i)} aria-label="حذف الحقل"><Icon name="x" /></button>
            </div>
          ))}

          {/* buttons */}
          <div className="card-hd" style={{ marginTop: 18 }}>
            <div className="card-title"><Icon name="external-link" /> أزرار الروابط</div>
            <button className="btn btn-subtle" onClick={addButton}><Icon name="plus" /> زر</button>
          </div>
          {buttons.map((b, i) => (
            <div className="field-row" key={i} style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}><label>النص</label><input className="input" value={b.label} onChange={(e) => setButton(i, { label: e.target.value })} /></div>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}><label>الرابط</label><input className="input" value={b.url} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://..." /></div>
              <button className="btn btn-subtle" onClick={() => removeButton(i)} aria-label="حذف الزر"><Icon name="x" /></button>
            </div>
          ))}

          {/* actions */}
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" disabled={save.isPending} onClick={doSave}><Icon name="check" /> حفظ</button>
          </div>
          <div className="field-row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>قناة النشر</label><Select value={postChannel} onChange={setPostChannel} options={channels} placeholder="اختر قناة" /></div>
            <button className="btn btn-primary" disabled={!editId || post.isPending} onClick={doPost}><Icon name="megaphone" /> نشر</button>
          </div>
          {!editId && <div className="hint" style={{ marginTop: 8 }}>احفظ القالب أولاً لتتمكّن من نشره.</div>}
        </div>
      </div>
    </div>
  );
}
