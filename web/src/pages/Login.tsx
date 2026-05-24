const messages: Record<string, string> = {
  notmember: 'لست عضوًا في السيرفر.',
  forbidden: 'ما عندك صلاحية الدخول (الإداريين فقط).',
  oauth: 'تعذّر تسجيل الدخول، حاول مرة ثانية.',
  nocode: 'تعذّر تسجيل الدخول، حاول مرة ثانية.',
};

export function Login() {
  const error = new URLSearchParams(window.location.search).get('error');
  return (
    <div className="center-screen">
      <div className="login-card">
        <div className="login-logo">LIFEYOI</div>
        <p className="login-sub">لوحة تحكم سيرفر ديسكورد</p>
        <a className="btn btn-primary" style={{ width: '100%' }} href="/api/auth/login">
          تسجيل الدخول عبر Discord
        </a>
        {error && <p className="err-text">{messages[error] ?? 'حدث خطأ، حاول مرة ثانية.'}</p>}
      </div>
    </div>
  );
}
