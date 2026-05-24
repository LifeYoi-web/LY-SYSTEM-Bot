export function Login() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#1a1a1a', color: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#f57c00' }}>LY-SYSTEM Dashboard</h1>
        <a
          href="/api/auth/login"
          style={{ display: 'inline-block', marginTop: 16, padding: '12px 24px', background: '#f57c00', color: '#fff', borderRadius: 8, textDecoration: 'none' }}
        >
          تسجيل الدخول عبر Discord
        </a>
      </div>
    </div>
  );
}
