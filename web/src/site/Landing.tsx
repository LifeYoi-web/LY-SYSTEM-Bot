import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../lib/icons';
import { AreaChart } from '../components/charts';

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'shield-check', title: 'إشراف متكامل', desc: 'حظر، طرد، كتم وتحذير — مع سجلّ عقوبات كامل وإمكانية رفع العقوبة بضغطة.' },
  { icon: 'shield-alert', title: 'حماية تلقائية', desc: 'مكافحة السبام، روابط الدعوات، الروابط الخارجية، الكلمات المحظورة والإشارات المفرطة.' },
  { icon: 'bar-chart', title: 'إحصائيات حيّة', desc: 'نمو الأعضاء، نشاط الرسائل، والعقوبات في رسوم بيانية تتحدّث لحظيًا.' },
  { icon: 'smile', title: 'ترحيب ذكي', desc: 'رسائل ترحيب ووداع قابلة للتخصيص، ورتبة تلقائية لكل عضو جديد.' },
  { icon: 'scroll', title: 'سجلّات شاملة', desc: 'تتبّع كل حدث في سيرفرك: الانضمام، المغادرة، حذف الرسائل والإجراءات.' },
  { icon: 'terminal', title: 'أوامر Slash', desc: 'مجموعة أوامر إشراف وأدوات جاهزة ومحميّة بصلاحيات Discord.' },
];

const COMMANDS = ['/ban', '/kick', '/timeout', '/warn', '/unban', '/clear', '/slowmode', '/userinfo', '/serverinfo', '/avatar', '/poll', '/say'];

const MOCK_LABELS = ['1', '5', '10', '15', '20', '25', '30'];
const MOCK = [12, 28, 22, 40, 35, 52, 64];

export function Landing() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="site">
      <div className="site-bg" />

      <nav className={`site-nav ${stuck ? 'stuck' : ''}`}>
        <Link to="/" className="logo">
          <img src="/logo.png" alt="" />
          LY-SYSTEM
        </Link>
        <div className="links">
          <a href="#features">المميزات</a>
          <a href="#showcase">اللوحة</a>
          <a href="#commands">الأوامر</a>
        </div>
        <Link className="btn btn-primary btn-sm" to="/login">
          <Icon name="discord" /> دخول
        </Link>
      </nav>

      {/* Hero */}
      <header className="hero">
        <div>
          <span className="hero-pill">
            <span className="dot-status" /> يعمل 24/7 على Railway
          </span>
          <h1>
            تحكّم كامل بسيرفرك <span className="gradient-text">من مكان واحد</span>
          </h1>
          <p className="lead">
            LY-SYSTEM نظام إدارة وحماية متكامل لسيرفر ديسكورد — بوت قوي ولوحة تحكم أنيقة على الويب، بالعربي وبالكامل.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" to="/login">
              <Icon name="discord" /> ادخل للوحة التحكم
            </Link>
            <a className="btn btn-ghost btn-lg" href="#features">
              تعرّف أكثر <Icon name="chevron-left" />
            </a>
          </div>
          <div className="hero-stats">
            <div className="hs">
              <b className="gradient-text">24/7</b>
              <span>تشغيل مستمر</span>
            </div>
            <div className="hs">
              <b className="gradient-text">15+</b>
              <span>أمر جاهز</span>
            </div>
            <div className="hs">
              <b className="gradient-text">∞</b>
              <span>مميزات تتوسّع</span>
            </div>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-glow" />
          <div className="hero-frame">
            <img src="/logo.png" alt="LY-SYSTEM" />
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="section" id="features">
        <div className="section-head">
          <span className="eyebrow">المميزات</span>
          <h2>كل ما يحتاجه سيرفرك</h2>
          <p>أدوات إشراف وحماية وتحليلات في حزمة واحدة، مصمّمة لتكون سريعة وواضحة.</p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="fi">
                <Icon name={f.icon} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Showcase */}
      <section className="section" id="showcase">
        <div className="showcase">
          <div className="showcase-copy">
            <span className="eyebrow">لوحة التحكم</span>
            <h2 style={{ fontSize: 'clamp(26px,3.6vw,36px)', marginTop: 10 }}>إدارة بصرية، لحظية، وأنيقة</h2>
            <ul>
              <li>
                <Icon name="check-circle" /> تحكّم كامل من المتصفح دون أوامر معقّدة.
              </li>
              <li>
                <Icon name="check-circle" /> بيانات تتحدّث تلقائيًا كل ٣٠ ثانية.
              </li>
              <li>
                <Icon name="check-circle" /> تصميم عربي RTL داكن مريح للعين.
              </li>
              <li>
                <Icon name="check-circle" /> دخول آمن عبر Discord OAuth — للإدارة فقط.
              </li>
            </ul>
            <Link className="btn btn-primary btn-lg" to="/login" style={{ marginTop: 26 }}>
              جرّبها الآن
            </Link>
          </div>
          <div className="mock">
            <div className="mock-bar">
              <i /> <i /> <i />
            </div>
            <div className="mock-kpis">
              <div className="mock-kpi">
                <b className="gradient-text tnum">1,248</b>
                <span>الأعضاء</span>
              </div>
              <div className="mock-kpi">
                <b className="tnum">64</b>
                <span>رسائل اليوم</span>
              </div>
              <div className="mock-kpi">
                <b className="tnum">3</b>
                <span>عقوبات فعّالة</span>
              </div>
            </div>
            <div className="mock-chart">
              <AreaChart labels={MOCK_LABELS} series={[{ name: 'النشاط', color: 'var(--accent)', values: MOCK }]} height={150} />
            </div>
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="section" id="commands">
        <div className="section-head">
          <span className="eyebrow">الأوامر</span>
          <h2>أوامر Slash جاهزة</h2>
          <p>أوامر إشراف وأدوات تُسجَّل تلقائيًا في سيرفرك.</p>
        </div>
        <div className="cmd-grid">
          {COMMANDS.map((c) => (
            <div className="cmd" key={c}>
              <Icon name="terminal" />
              {c}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="cta-band">
          <h2>
            جاهز تتحكّم <span className="gradient-text">بسيرفرك؟</span>
          </h2>
          <p>سجّل الدخول بحساب Discord وابدأ خلال ثوانٍ.</p>
          <Link className="btn btn-primary btn-lg" to="/login">
            <Icon name="discord" /> ابدأ الآن
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="logo">
          <img src="/logo.png" alt="" />
          LY-SYSTEM
        </div>
        <span>© {new Date().getFullYear()} LY-SYSTEM — جميع الحقوق محفوظة.</span>
      </footer>
    </div>
  );
}
