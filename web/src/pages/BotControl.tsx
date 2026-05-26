import { useEffect, useState } from 'react';
import { useBotPresence, useUpdateBotPresence, useRestartBot } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { SkeletonRows, toast } from '../components/ui';

const TYPES: { v: string; label: string; hint: string }[] = [
  { v: 'watching', label: 'يشاهد (Watching)', hint: 'يظهر: Watching <النص>' },
  { v: 'playing', label: 'يلعب (Playing)', hint: 'يظهر: Playing <النص>' },
  { v: 'listening', label: 'يستمع (Listening)', hint: 'يظهر: Listening to <النص>' },
  { v: 'streaming', label: 'بثّ (Streaming)', hint: 'يصير قابلًا للضغط — يحتاج رابط Twitch أو YouTube' },
  { v: 'custom', label: 'مخصّص (Custom)', hint: 'يظهر النص فقط بدون كلمة قبله' },
];

export function BotControl() {
  const { data, isLoading } = useBotPresence();
  const save = useUpdateBotPresence();
  const restart = useRestartBot();

  const [type, setType] = useState('watching');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!data) return;
    setType(data.type ?? 'watching');
    setText(data.text ?? '');
    setUrl(data.url ?? '');
  }, [data]);

  if (isLoading) return <SkeletonRows rows={4} />;

  function submit() {
    save.mutate(
      { type, text: text.trim() || null, url: type === 'streaming' ? url.trim() || null : null },
      {
        onSuccess: () => toast('تم تحديث حالة البوت'),
        onError: () => toast('فشل التحديث — البثّ يحتاج رابط Twitch أو YouTube', 'err'),
      },
    );
  }

  function doRestart() {
    if (!window.confirm('إعادة تشغيل البوت؟ البوت ولوحة التحكم بيكونون غير متاحين لـ ~30-60 ثانية ثم يرجعون.')) return;
    restart.mutate(undefined, {
      onSuccess: () => toast('جارٍ إعادة التشغيل... ارجع بعد دقيقة تقريبًا'),
      onError: () => toast('فشل طلب إعادة التشغيل', 'err'),
    });
  }

  const activeType = TYPES.find((t) => t.v === type);

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="activity" /> حالة البوت (Activity)
          </div>
        </div>

        <div className="field">
          <label>النوع</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.label}
              </option>
            ))}
          </select>
          {activeType && <div className="hint">{activeType.hint}</div>}
        </div>

        <div className="field">
          <label>النص</label>
          <input
            className="input"
            value={text}
            maxLength={128}
            onChange={(e) => setText(e.target.value)}
            placeholder="مثال: {members} عضو • /help"
          />
          <div className="hint">
            تقدر تكتب <code className="mono">{'{members}'}</code> ويتحوّل تلقائيًا لعدد الأعضاء. اتركه فاضي للحالة الافتراضية.
          </div>
        </div>

        {type === 'streaming' && (
          <div className="field">
            <label>رابط البثّ</label>
            <input
              className="input"
              value={url}
              dir="ltr"
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://twitch.tv/...  أو  https://youtube.com/..."
            />
            <div className="hint">لازم رابط Twitch أو YouTube عشان الحالة تصير قابلة للضغط (قيد من ديسكورد).</div>
          </div>
        )}

        <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>
          <Icon name="check" /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ الحالة'}
        </button>
      </div>

      <div className="card card-pad">
        <div className="card-hd">
          <div className="card-title">
            <Icon name="refresh-cw" /> إعادة تشغيل البوت
          </div>
        </div>
        <p className="card-sub" style={{ marginBottom: 16 }}>
          يعيد تشغيل عملية البوت بالكامل. البوت ولوحة التحكم بيكونون غير متاحين لـ ~٣٠–٦٠ ثانية ثم يرجعون تلقائيًا.
        </p>
        <button className="btn btn-danger" disabled={restart.isPending} onClick={doRestart}>
          <Icon name="refresh-cw" /> {restart.isPending ? 'جارٍ إعادة التشغيل...' : 'إعادة تشغيل البوت'}
        </button>
      </div>
    </div>
  );
}
