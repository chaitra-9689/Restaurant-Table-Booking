// Shared helpers for the public site and the CRM.

// guest: true → never read the CRM's stored staff session, so the public site always
// behaves as an anonymous visitor even when staff are signed in on the same domain.
export function getClient({ guest = false } = {}) {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    document.body.innerHTML = `
      <div style="max-width:560px;margin:15vh auto;padding:24px;font-family:system-ui;line-height:1.6">
        <h2>Setup needed</h2>
        <p>Add <code>SUPABASE_ANON_KEY</code> to <code>.env</code> (Supabase Dashboard → Project Settings → API Keys),
        then restart the server with <code>npm start</code>.</p>
      </div>`;
    throw new Error('Supabase is not configured');
  }
  const options = guest
    ? { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-guest' } }
    : undefined;
  return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, options);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];

// YYYY-MM-DD for "today" in the restaurant's timezone.
export function todayIn(timeZone, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined }).format(d);
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(isoDate, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

export const money = (n) => Number(n).toFixed(2);

// Turn Postgres / Supabase errors into a readable sentence.
export function errMsg(error) {
  if (!error) return 'Something went wrong';
  return (error.message || String(error)).replace(/^.*P0001:\s*/, '');
}
