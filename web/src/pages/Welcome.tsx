import { useEffect, useRef, useState } from 'react';
import { useSettings, useUpdateSettings, useOverview, useEntitlements } from '../lib/hooks';
import type { Settings, WelcomeButton } from '../lib/types';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions, useRoleOptions } from '../components/pickers';
import { PremiumLock } from '../components/PremiumLock';

const DEFAULT_WELCOME = 'أهلًا وسهلًا {user} في **{server}**! 🎉 صرت العضو رقم **#{position}**.';
const DEFAULT_GOODBYE = 'وداعًا {username} 👋 — صار عدد الأعضاء **{memberCount}**.';
const DEFAULT_DM = 'أهلًا {username} في {server}! شرفنا انضمامك. ابدأ بقراءة القوانين ولا تتردد لو احتجت أي شي. 🎉';

const PLACEHOLDERS = ['{user}', '{username}', '{server}', '{memberCount}', '{position}', '{accountAge}', '{createdAt}'];

// Must match WELCOME_CARD_STYLES keys in src/bot/welcomeCard (thumbnails in /welcome-styles/<key>.png).
const CARD_STYLES: { key: string; label: string }[] = [
  { key: 'classic', label: 'الكلاسيكي' },
  { key: 'neon-hud', label: 'النيون السيبراني' },
  { key: 'calligraphy-gold', label: 'حبر وذهب' },
  { key: 'aurora-glass', label: 'زجاج الشفق' },
  { key: 'islamic-star', label: 'النجمة الثمانية' },
  { key: 'vip-ticket', label: 'تذكرة VIP' },
  { key: 'constellation', label: 'سماء الانضمام' },
  { key: 'synthwave', label: 'الغروب الرقمي' },
  { key: 'liquid-gold', label: 'الذهب السائل' },
];

function render(tpl: string, server: string, count: number) {
  return tpl
    .split('{user}').join('@أحمد')
    .split('{username}').join('أحمد')
    .split('{server}').join(server)
    .split('{memberCount}').join(String(count))
    .split('{count}').join(String(count))
    .split('{position}').join(String(count))
    .split('{accountAge}').join('٣ أشهر')
    .split('{createdAt}').join('قبل ٣ أشهر');
}

const MAX_BG_BYTES = 1_500_000; // ~1.5 MB binary

export function Welcome() {
  const { data, isLoading } = useSettings();
  const ov = useOverview();
  const save = useUpdateSettings();
  const channels = useChannelOptions(['text', 'announcement']);
  const roles = useRoleOptions();
  const [d, setD] = useState<Settings | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: ent } = useEntitlements();
  const stylesLocked = ent?.features.welcomeStyles === false;
  const bgLocked = ent?.features.welcomeCustomBg === false;

  useEffect(() => { if (data) setD(data); }, [data]);

  if (isLoading || !d) return <SkeletonRows rows={8} />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setD({ ...d, [k]: v });
  const serverName = ov.data?.name ?? 'سيرفرك';
  const count = ov.data?.memberCount ?? 100;

  function submit() {
    if (!d) return;
    save.mutate(
      {
        welcomeEnabled: d.welcomeEnabled,
        welcomeChannelId: d.welcomeChannelId,
        welcomeMessage: d.welcomeMessage,
        goodbyeEnabled: d.goodbyeEnabled,
        goodbyeMessage: d.goodbyeMessage,
        autoRoleId: d.autoRoleId,
        welcomeUseCard: d.welcomeUseCard,
        // Locked plans coerce to null so a stale premium BG can't 403 every save after a downgrade.
        welcomeCardBg: bgLocked ? null : d.welcomeCardBg,
        // Locked plans coerce to classic so an old premium pick can't 403 every save after a downgrade.
        welcomeCardStyle: stylesLocked ? 'classic' : d.welcomeCardStyle,
        welcomeButtons: d.welcomeButtons,
        welcomeDmEnabled: d.welcomeDmEnabled,
        welcomeDmMessage: d.welcomeDmMessage,
        welcomeMentionDeleteSeconds: d.welcomeMentionDeleteSeconds,
        goodbyeUseCard: d.goodbyeUseCard,
        welcomeEmbedEnabled: d.welcomeEmbedEnabled,
        goodbyeEmbedEnabled: d.goodbyeEmbedEnabled,
      },
      { onSuccess: () => toast('تم حفظ إعدادات الترحيب'), onError: () => toast('فشل الحفظ', 'err') },
    );
  }

  function uploadBg(file: File) {
    if (file.size > MAX_BG_BYTES) {
      toast('الصورة أكبر من ١٫٥ ميجابايت', 'err');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('welcomeCardBg', String(reader.result));
    reader.onerror = () => toast('تعذّر قراءة الملف', 'err');
    reader.readAsDataURL(file);
  }

  const previewText = render(d.welcomeMessage || DEFAULT_WELCOME, serverName, count);
  const previewDm = d.welcomeDmEnabled ? render(d.welcomeDmMessage || DEFAULT_DM, serverName, count) : null;
  const buttons = d.welcomeButtons ?? [];

  function setButton(i: number, patch: Partial<WelcomeButton>) {
    const next = buttons.slice();
    next[i] = { ...next[i], ...patch };
    set('welcomeButtons', next);
  }
  function addButton() {
    if (buttons.length >= 5) return;
    set('welcomeButtons', [...buttons, { label: '', url: '' }]);
  }
  function removeButton(i: number) {
    set('welcomeButtons', buttons.filter((_, j) => j !== i));
  }

  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <PremiumLock feature="welcomeStyles" ent={ent ?? null} />
      <div className="card card-pad" style={{ borderColor: d.welcomeEnabled ? 'var(--accent-line)' : undefined }}>
        <div className="toggle-row" style={{ padding: 0, border: 'none' }}>
          <div className="row">
            <div className="kpi-ico" style={{ background: 'var(--accent-soft)' }}><Icon name="sparkles" /></div>
            <div><div className="tr-title" style={{ fontSize: 16 }}>ترحيب فخم</div><div className="tr-sub">embed كامل + بطاقة صورة مرسومة + أزرار + DM ترحيب اختياري.</div></div>
          </div>
          <Switch checked={d.welcomeEnabled} onChange={(v) => set('welcomeEnabled', v)} label="تفعيل الترحيب" />
        </div>
      </div>

      <div className="grid grid-2" style={{ opacity: d.welcomeEnabled ? 1 : 0.55, pointerEvents: d.welcomeEnabled ? 'auto' : 'none' }}>
        <div className="stack">
          <div className="card card-pad">
            <div className="field"><label>قناة الترحيب</label><Select value={d.welcomeChannelId} onChange={(v) => set('welcomeChannelId', v)} options={channels} placeholder="اختر قناة" /></div>
            <div className="field"><label>نص الترحيب (يدعم Markdown)</label><textarea className="textarea" value={d.welcomeMessage ?? ''} onChange={(e) => set('welcomeMessage', e.target.value)} placeholder={DEFAULT_WELCOME} /><div className="hint">المتغيّرات: {PLACEHOLDERS.join(' · ')}</div></div>
            <div className="toggle-row"><div><div className="tr-title">إرسال كـ Embed</div><div className="tr-sub">مفعّل: صندوق فاخر بحقول وألوان. مطفأ: نص عادي + البطاقة بعرض كامل بدون صندوق.</div></div><Switch checked={d.welcomeEmbedEnabled} onChange={(v) => set('welcomeEmbedEnabled', v)} /></div>
            <div className="toggle-row"><div><div className="tr-title">بطاقة صورة (PNG)</div><div className="tr-sub">يولّد البوت صورة بأفاتار العضو واسمه فوق خلفية مخصّصة.</div></div><Switch checked={d.welcomeUseCard} onChange={(v) => set('welcomeUseCard', v)} /></div>
            {d.welcomeUseCard && (
              <div className="field">
                <label>ستايل البطاقة</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {CARD_STYLES.map((s) => {
                    const active = (d.welcomeCardStyle || 'classic') === s.key;
                    const isLocked = stylesLocked && s.key !== 'classic';
                    return (
                      <button
                        key={s.key}
                        type="button"
                        disabled={isLocked}
                        onClick={() => !isLocked && set('welcomeCardStyle', s.key)}
                        style={{
                          padding: 0,
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          textAlign: 'start',
                          background: 'var(--bg-2)',
                          border: active ? '2px solid var(--accent)' : '1px solid var(--line, #2a2f3a)',
                          borderRadius: 10,
                          overflow: 'hidden',
                          boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
                          opacity: isLocked ? 0.5 : 1,
                          position: 'relative',
                        }}
                      >
                        <img src={`/welcome-styles/${s.key}.png`} alt={s.label} style={{ display: 'block', width: '100%', aspectRatio: '3 / 1', objectFit: 'cover' }} />
                        <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: active ? 700 : 400, color: active ? 'var(--accent)' : undefined, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isLocked && <Icon name="lock" size={11} />}
                          {s.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="hint">الخلفية المخصّصة أدناه تعمل مع الستايل «الكلاسيكي» فقط — بقية الستايلات فنّها هو الخلفية.</div>
              </div>
            )}
            <div className="field" style={{ opacity: bgLocked ? 0.5 : 1 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {bgLocked && <Icon name="lock" size={11} />}
                خلفية مخصّصة للبطاقة (PNG/JPG، ≤ ١٫٥MB)
              </label>
              <div className="row" style={{ gap: 8 }}>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBg(f); }} />
                <button className="btn btn-ghost btn-sm" disabled={bgLocked} onClick={() => !bgLocked && fileInput.current?.click()} style={{ cursor: bgLocked ? 'not-allowed' : undefined }}><Icon name="plus" /> رفع</button>
                {d.welcomeCardBg && !bgLocked && <button className="btn btn-ghost btn-sm" onClick={() => set('welcomeCardBg', null)}><Icon name="trash" /> إزالة</button>}
                <div className="tr-sub" style={{ flex: 1 }}>
                  {bgLocked ? 'الخلفية المخصّصة ميزة بريميوم — رقِّ السيرفر لفتحها' : d.welcomeCardBg ? 'خلفية مخصّصة محفوظة (تُطبَّق على الكلاسيكي فقط)' : 'تُستخدم خلفية الستايل المختار'}
                </div>
              </div>
              {d.welcomeCardBg && !bgLocked && <img src={d.welcomeCardBg} alt="" style={{ marginTop: 8, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line, #2a2f3a)' }} />}
            </div>
            <div className="field"><label>حذف الذكر (@ping) بعد كم ثانية (٠ = ابقِه)</label><input type="number" className="input" min={0} max={60} value={d.welcomeMentionDeleteSeconds} onChange={(e) => set('welcomeMentionDeleteSeconds', Math.max(0, Math.min(60, Number(e.target.value) || 0)))} /></div>
          </div>

          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="external-link" /> أزرار الترحيب (روابط)</div><button className="btn btn-ghost btn-sm" onClick={addButton} disabled={buttons.length >= 5}><Icon name="plus" /> إضافة</button></div>
            {buttons.length === 0 ? (
              <div className="tr-sub">ما فيه أزرار. اضغط «إضافة» (الحد ٥). أمثلة: «اقرأ القوانين» «اختر رتبتك» «افتح تذكرة».</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {buttons.map((b, i) => (
                  <div key={i} className="row" style={{ gap: 6 }}>
                    <input className="input" style={{ flex: 1 }} value={b.label} onChange={(e) => setButton(i, { label: e.target.value })} maxLength={80} placeholder="نص الزر" />
                    <input className="input" style={{ flex: 2 }} value={b.url} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://..." />
                    <input className="input" style={{ width: 72 }} value={b.emoji ?? ''} onChange={(e) => setButton(i, { emoji: e.target.value || undefined })} maxLength={8} placeholder="🚪" />
                    <button className="btn btn-ghost btn-sm" onClick={() => removeButton(i)}><Icon name="trash" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div className="toggle-row" style={{ marginBottom: d.welcomeDmEnabled ? 12 : 0 }}><div><div className="tr-title">رسالة خاصة (DM) للعضو الجديد</div><div className="tr-sub">ترحيب شخصي يصل خاص — منفصل عن قناة الترحيب.</div></div><Switch checked={d.welcomeDmEnabled} onChange={(v) => set('welcomeDmEnabled', v)} /></div>
            {d.welcomeDmEnabled && (
              <div className="field" style={{ marginBottom: 0 }}><label>نص الـDM</label><textarea className="textarea" value={d.welcomeDmMessage ?? ''} onChange={(e) => set('welcomeDmMessage', e.target.value)} placeholder={DEFAULT_DM} /><div className="hint">نفس المتغيّرات السابقة.</div></div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="eye" /> معاينة الـEmbed</div></div>
            <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--bg-2)', borderRadius: 12, borderInlineStart: '3px solid var(--accent)' }}>
              <div className="avatar" style={{ background: 'var(--grad-accent)' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>LY-SYSTEM <span className="tag-bot">BOT</span></div>
                <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>✨ أهلًا بك في {serverName}</div>
                <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.7 }}>{previewText}</div>
                <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="badge">📊 الترتيب #{count}</span>
                  <span className="badge">🕐 ٣ أشهر</span>
                </div>
                {buttons.length > 0 && (
                  <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {buttons.map((b, i) => (
                      <span key={i} className="badge badge-active" style={{ background: 'var(--accent-soft)' }}>{b.emoji} {b.label || '—'}</span>
                    ))}
                  </div>
                )}
                {d.welcomeUseCard && (
                  <div style={{ marginTop: 10, padding: 10, border: '1px dashed var(--line, #2a2f3a)', borderRadius: 8, fontSize: 12, opacity: 0.85 }}>
                    🖼️ تُولَّد بطاقة PNG لكل عضو (1200×400) بستايل «{CARD_STYLES.find((s) => s.key === (d.welcomeCardStyle || 'classic'))?.label ?? 'الكلاسيكي'}» — أفاتاره + اسمه فوق الفن المختار.
                  </div>
                )}
              </div>
            </div>
            {previewDm && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-2)', borderRadius: 8, fontSize: 13 }}>
                <div className="tr-sub" style={{ marginBottom: 4 }}>📩 DM الترحيب:</div>{previewDm}
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-hd"><div className="card-title"><Icon name="at-sign" /> رتبة تلقائية</div></div>
            <div className="field" style={{ marginBottom: 0 }}><label>تُمنح لكل عضو جديد</label><Select value={d.autoRoleId} onChange={(v) => set('autoRoleId', v)} options={roles} placeholder="بدون رتبة تلقائية" /></div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="toggle-row" style={{ padding: 0, border: 'none', marginBottom: d.goodbyeEnabled ? 16 : 0 }}>
          <div><div className="tr-title" style={{ fontSize: 15 }}>رسالة الوداع</div><div className="tr-sub">تُرسل في قناة الترحيب عند مغادرة عضو.</div></div>
          <Switch checked={d.goodbyeEnabled} onChange={(v) => set('goodbyeEnabled', v)} />
        </div>
        {d.goodbyeEnabled && (
          <>
            <div className="field"><label>نص الوداع</label><textarea className="textarea" value={d.goodbyeMessage ?? ''} onChange={(e) => set('goodbyeMessage', e.target.value)} placeholder={DEFAULT_GOODBYE} /></div>
            <div className="toggle-row"><div><div className="tr-title">إرسال كـ Embed</div><div className="tr-sub">مطفأ: نص الوداع عادي + بطاقة الوداع بعرض كامل.</div></div><Switch checked={d.goodbyeEmbedEnabled} onChange={(v) => set('goodbyeEmbedEnabled', v)} /></div>
            <div className="toggle-row" style={{ marginBottom: 0 }}><div><div className="tr-title">بطاقة وداع</div><div className="tr-sub">يولّد البوت بطاقة PNG وداع مماثلة لبطاقة الترحيب.</div></div><Switch checked={d.goodbyeUseCard} onChange={(v) => set('goodbyeUseCard', v)} /></div>
          </>
        )}
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={save.isPending} onClick={submit}><Icon name="check" /> {save.isPending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button>
      </div>
    </div>
  );
}
