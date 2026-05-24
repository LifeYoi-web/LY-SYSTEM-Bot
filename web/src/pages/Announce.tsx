import { useState, type CSSProperties } from 'react';
import { useAnnounce } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function Announce() {
  const channels = useChannelOptions(['text', 'announcement']);
  const send = useAnnounce();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [useEmbed, setUseEmbed] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#f57c00');
  const [imageUrl, setImageUrl] = useState('');
  const [footer, setFooter] = useState('');

  function submit() {
    if (!channelId) return toast('اختر قناة', 'err');
    const embed = useEmbed ? { title, description, color, imageUrl, footer } : undefined;
    if (!content.trim() && !(useEmbed && (title || description || imageUrl))) return toast('أضف محتوى أو Embed', 'err');
    send.mutate(
      { channelId, content: content.trim() || undefined, embed },
      { onSuccess: () => toast('تم الإرسال إلى القناة'), onError: () => toast('تعذّر الإرسال — تحقق من صلاحيات البوت', 'err') },
    );
  }

  const accent = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#f57c00';

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="megaphone" /> إنشاء إعلان</div></div>
          <div className="field"><label>القناة</label><Select value={channelId} onChange={setChannelId} options={channels} placeholder="اختر قناة" /></div>
          <div className="field"><label>نص عادي (اختياري)</label><textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="رسالة نصية فوق البطاقة..." style={{ minHeight: 60 }} /></div>

          <div className="toggle-row">
            <div><div className="tr-title">بطاقة Embed</div><div className="tr-sub">إرسال بطاقة منسّقة.</div></div>
            <label className="switch"><input type="checkbox" checked={useEmbed} onChange={(e) => setUseEmbed(e.target.checked)} /><span className="track"><span className="thumb" /></span></label>
          </div>

          {useEmbed && (
            <div style={{ marginTop: 14 }}>
              <div className="field"><label>العنوان</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="field"><label>الوصف</label><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="field-row">
                <div className="field" style={{ flex: '0 0 130px' }}>
                  <label>اللون</label>
                  <input className="input" type="color" value={accent} onChange={(e) => setColor(e.target.value)} style={{ padding: 4, height: 42 }} />
                </div>
                <div className="field" style={{ flex: 1 }}><label>رابط صورة</label><input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label>التذييل</label><input className="input" value={footer} onChange={(e) => setFooter(e.target.value)} /></div>
            </div>
          )}

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" disabled={send.isPending} onClick={submit}><Icon name="megaphone" /> {send.isPending ? 'جارٍ الإرسال...' : 'إرسال الإعلان'}</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-hd"><div className="card-title"><Icon name="eye" /> معاينة</div></div>
          <div style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14 }}>
            {content && <div style={{ marginBottom: 10, fontSize: 14, whiteSpace: 'pre-wrap' }}>{content}</div>}
            {useEmbed && (title || description || imageUrl) && (
              <div style={{ borderInlineStart: `4px solid ${accent}`, background: 'var(--surface)', borderRadius: 8, padding: '12px 14px', ['--x' as string]: '' } as CSSProperties}>
                {title && <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>}
                {description && <div style={{ fontSize: 14, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{description}</div>}
                {imageUrl && /^https?:\/\//.test(imageUrl) && (
                  <img src={imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 10 }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                )}
                {footer && <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 10 }}>{footer}</div>}
              </div>
            )}
            {!content && !(useEmbed && (title || description || imageUrl)) && <div className="faint" style={{ fontSize: 13 }}>تظهر المعاينة هنا...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
