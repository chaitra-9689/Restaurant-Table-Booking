import { getClient, esc, DAYS, todayIn, addDays, fmtDate, fmtTime, money, errMsg } from '/js/common.js';

const sb = getClient();
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
const ACTIVE = ['pending', 'confirmed', 'seated'];
const SOURCES = { website: 'Website', phone: 'Phone', walk_in: 'Walk-in', staff: 'Staff' };
const BOOKING_SELECT = '*, customer:customers(id, full_name, email, phone, is_vip, tags), table:restaurant_tables(id, name, capacity)';

const state = {
  me: null,
  settings: null,
  tables: [],
  bk: null, // bookings filter, initialised once settings are loaded
  realtime: null,
};

const today = () => todayIn(state.settings?.timezone);
const label = (s) => s.replace('_', ' ');

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

function statusBadge(s) {
  return `<span class="badge ${esc(s)}">${esc(label(s))}</span>`;
}

function statusSelect(b) {
  return `<select class="status-select badge ${esc(b.status)}" data-status-for="${b.id}" aria-label="Status">
    ${STATUSES.map((s) => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${label(s)}</option>`).join('')}
  </select>`;
}

function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  if (total >= 24 * 60) return '23:59';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function setActions(html) {
  $('#page-actions').innerHTML = html;
}

/**
 * Generic form modal. onSubmit(formData, form) may throw to show an error.
 * Returns when opened; closes itself on success.
 */
function openModal({ title, body, submitLabel = 'Save', onSubmit, onDelete, deleteLabel = 'Delete', onOpen, hideSubmit }) {
  const dlg = $('#modal');
  const form = $('#modal-form');
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-error').classList.add('hidden');
  $('#modal-foot').innerHTML = `
    ${onDelete ? `<button type="button" class="btn btn-danger" id="modal-delete">${esc(deleteLabel)}</button>` : ''}
    <div class="right">
      <button class="btn btn-ghost" value="cancel" formnovalidate>${hideSubmit ? 'Close' : 'Cancel'}</button>
      ${hideSubmit ? '' : `<button class="btn" type="submit" id="modal-submit" data-testid="modal-submit">${esc(submitLabel)}</button>`}
    </div>`;

  const showErr = (e) => {
    $('#modal-error').textContent = errMsg(e);
    $('#modal-error').classList.remove('hidden');
  };

  form.onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return; // native dialog close
    e.preventDefault();
    if (!onSubmit) return dlg.close();
    const btn = $('#modal-submit');
    btn.disabled = true;
    try {
      await onSubmit(new FormData(form), form);
      dlg.close();
    } catch (err) {
      showErr(err);
    } finally {
      btn.disabled = false;
    }
  };

  if (onDelete) {
    $('#modal-delete').onclick = async () => {
      if (!confirm('Are you sure? This cannot be undone.')) return;
      try {
        await onDelete();
        dlg.close();
      } catch (err) {
        showErr(err);
      }
    };
  }

  dlg.showModal();
  onOpen?.(form);
}

// Throw Supabase errors so openModal can display them.
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
let signupMode = false;

function showScreen(id) {
  for (const s of ['auth-screen', 'denied-screen', 'app']) $(`#${s}`).classList.toggle('hidden', s !== id);
}

function setAuthMode(signup) {
  signupMode = signup;
  $('#auth-title').textContent = signup ? 'Create staff account' : 'Staff sign in';
  $('#auth-sub').textContent = signup
    ? 'The first account becomes the admin. Others need an invite from an admin.'
    : 'Sign in to manage bookings, guests and the website.';
  $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in';
  $$('.signup-only').forEach((el) => el.classList.toggle('hidden', !signup));
  $('#auth-switch').innerHTML = signup
    ? 'Already have an account? <a href="#" id="toggle-auth">Sign in</a>'
    : 'New staff member? <a href="#" id="toggle-auth">Create an account</a>';
  $('#auth-msg').classList.add('hidden');
}

function authMessage(msg, ok = false) {
  const el = $('#auth-msg');
  el.textContent = msg;
  el.classList.toggle('ok', ok);
  el.classList.remove('hidden');
}

$('#auth-screen').addEventListener('click', (e) => {
  if (e.target.id !== 'toggle-auth') return;
  e.preventDefault();
  setAuthMode(!signupMode);
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = String(fd.get('email')).trim();
  const password = String(fd.get('password'));
  if (!email || password.length < 6) return authMessage('Enter your email and a password of at least 6 characters.');

  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    if (signupMode) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: String(fd.get('full_name') || '').trim() }, emailRedirectTo: location.origin + '/crm' },
      });
      if (error) throw error;
      if (!data.session) {
        authMessage('Account created. Check your inbox to confirm your email, then sign in.', true);
        setTimeout(() => setAuthMode(false), 50);
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    authMessage(errMsg(err));
  } finally {
    btn.disabled = false;
  }
});

for (const id of ['#signout', '#denied-signout']) {
  $(id).addEventListener('click', () => sb.auth.signOut());
}

let bootedFor = null;
sb.auth.onAuthStateChange((_event, session) => {
  // defer: calling supabase inside this callback can deadlock the auth lock
  setTimeout(() => handleSession(session), 0);
});

async function handleSession(session) {
  if (!session) {
    bootedFor = null;
    state.realtime?.unsubscribe();
    state.realtime = null;
    setAuthMode(false);
    showScreen('auth-screen');
    return;
  }
  if (bootedFor === session.user.id) return;
  bootedFor = session.user.id;

  let { data: me } = await sb.from('staff').select('*').eq('user_id', session.user.id).maybeSingle();
  if (!me) {
    // invited after this account already existed
    const { data: claimed } = await sb.rpc('claim_staff_invite');
    if (claimed) ({ data: me } = await sb.from('staff').select('*').eq('user_id', session.user.id).maybeSingle());
  }
  if (!me) {
    $('#denied-email').textContent = session.user.email;
    showScreen('denied-screen');
    return;
  }
  state.me = me;
  await boot();
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
async function loadSettings() {
  state.settings = must(await sb.from('site_settings').select('*').eq('id', 1).single());
  $('#side-name').textContent = state.settings.restaurant_name;
  $('#side-logo').src = state.settings.logo_url || '/img/logo.svg';
  $('#favicon').href = state.settings.logo_url || '/img/logo.svg';
}

async function loadTables() {
  state.tables = must(await sb.from('restaurant_tables').select('*').order('name'));
  state.tables.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function refreshPendingPill() {
  const { count } = await sb.from('bookings').select('id', { count: 'exact', head: true })
    .eq('status', 'pending').gte('booking_date', today());
  const pill = $('#pending-pill');
  pill.textContent = count || '';
  pill.classList.toggle('hidden', !count);
}

async function boot() {
  showScreen('app');
  $('#me-name').textContent = state.me.full_name || state.me.email;
  $('#me-role').textContent = state.me.role;
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', state.me.role !== 'admin'));

  await Promise.all([loadSettings(), loadTables()]);
  state.bk = { from: today(), to: today(), status: 'all', q: '' };
  refreshPendingPill();

  state.realtime = sb.channel('crm-bookings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
      if (payload.eventType === 'INSERT' && payload.new.source === 'website') {
        toast(`New website booking for ${payload.new.party_size} on ${fmtDate(payload.new.booking_date)} at ${fmtTime(payload.new.start_time)}`);
      }
      refreshPendingPill();
      if (['dashboard', 'bookings'].includes(currentRoute()) && !$('#modal').open) render();
    })
    .subscribe();

  render();
}

const ROUTES = {
  dashboard: { title: 'Dashboard', view: viewDashboard },
  bookings: { title: 'Bookings', view: viewBookings },
  customers: { title: 'Customers', view: viewCustomers },
  tables: { title: 'Tables', view: viewTables },
  menu: { title: 'Menu', view: viewMenu },
  website: { title: 'Site & booking settings', view: viewWebsite },
  staff: { title: 'Staff', view: viewStaff, admin: true },
};

function currentRoute() {
  const r = location.hash.replace(/^#\//, '').split('?')[0];
  return ROUTES[r] && (!ROUTES[r].admin || state.me?.role === 'admin') ? r : 'dashboard';
}

// Views return HTML; anything that binds to that HTML registers via the after() they are given.
// Hooks are per render, so a stale render that finishes late can't bind into the current view.
let renderSeq = 0;
async function render() {
  if (!state.me) return;
  const route = currentRoute();
  const seq = ++renderSeq;
  $$('.side-nav a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  $('#page-title').textContent = ROUTES[route].title;
  $('#sidebar').classList.remove('open');
  setActions('');
  const hooks = [];
  try {
    const html = await ROUTES[route].view({ after: (fn) => hooks.push(fn) });
    if (seq !== renderSeq) return;
    if (html !== undefined) $('#view').innerHTML = html;
    hooks.forEach((fn) => fn());
  } catch (err) {
    if (seq === renderSeq) $('#view').innerHTML = `<div class="card empty">Couldn't load: ${esc(errMsg(err))}</div>`;
  }
}

window.addEventListener('hashchange', render);
$('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

// Delegated: inline status changes anywhere in the app
$('#view').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-status-for]');
  if (!sel) return;
  const { error } = await sb.from('bookings').update({ status: sel.value }).eq('id', sel.dataset.statusFor);
  if (error) toast(errMsg(error), 'error');
  else toast(`Booking marked ${label(sel.value)}`);
  refreshPendingPill();
  render();
});

// Delegated: open booking editor
$('#view').addEventListener('click', (e) => {
  if (e.target.closest('select, button, a')) return;
  const row = e.target.closest('[data-booking-id]');
  if (row) editBooking(row.dataset.bookingId);
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function viewDashboard({ after }) {
  setActions('<button class="btn" id="new-booking" data-testid="new-booking">+ New booking</button>');
  $('#new-booking').onclick = () => newBooking();

  const t = today();
  const weekEnd = addDays(t, 6);
  const [todays, week, pending] = await Promise.all([
    sb.from('bookings').select(BOOKING_SELECT).eq('booking_date', t).order('start_time').then(must),
    sb.from('bookings').select('party_size, status').gte('booking_date', t).lte('booking_date', weekEnd).then(must),
    sb.from('bookings').select(BOOKING_SELECT).eq('status', 'pending').gte('booking_date', t)
      .order('booking_date').order('start_time').limit(10).then(must),
  ]);

  const live = todays.filter((b) => !['cancelled', 'no_show'].includes(b.status));
  const covers = live.reduce((n, b) => n + b.party_size, 0);
  const weekLive = week.filter((b) => !['cancelled', 'no_show'].includes(b.status));
  const seatedNow = todays.filter((b) => b.status === 'seated').reduce((n, b) => n + b.party_size, 0);

  const timeline = live.length
    ? live.map((b) => `
        <div class="timeline-item clickable" data-booking-id="${b.id}" style="cursor:pointer">
          <div class="timeline-time">${esc(fmtTime(b.start_time))}</div>
          <div class="timeline-main">
            <div class="guest-name">${esc(b.customer?.full_name)} ${b.customer?.is_vip ? '<span class="badge vip">VIP</span>' : ''}</div>
            <div class="sub">${b.party_size} guests · ${b.table ? esc(b.table.name) : '<em>No table</em>'}${b.special_requests ? ` · <span class="note-ico" title="${esc(b.special_requests)}">✎ ${esc(b.special_requests.slice(0, 40))}</span>` : ''}</div>
          </div>
          ${statusSelect(b)}
        </div>`).join('')
    : '<div class="empty">No bookings today yet.</div>';

  const pendingList = pending.length
    ? pending.map((b) => `
        <div class="timeline-item" data-booking-id="${b.id}" style="cursor:pointer">
          <div class="timeline-main">
            <div class="guest-name">${esc(b.customer?.full_name)}</div>
            <div class="sub">${esc(fmtDate(b.booking_date, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${esc(fmtTime(b.start_time))} · ${b.party_size} guests</div>
          </div>
          <button class="btn btn-sm" data-confirm="${b.id}">Confirm</button>
        </div>`).join('')
    : '<div class="empty">Nothing waiting for approval.</div>';

  after(() => {
    $$('[data-confirm]').forEach((btn) => btn.onclick = async () => {
      const { error } = await sb.from('bookings').update({ status: 'confirmed' }).eq('id', btn.dataset.confirm);
      if (error) return toast(errMsg(error), 'error');
      toast('Booking confirmed');
      refreshPendingPill();
      render();
    });
  });

  return `
    <div class="stats">
      <div class="card stat" data-testid="stat-today"><div class="label">Bookings today</div><div class="value">${live.length}</div></div>
      <div class="card stat"><div class="label">Covers today</div><div class="value">${covers}</div></div>
      <div class="card stat"><div class="label">Guests seated now</div><div class="value">${seatedNow}</div></div>
      <div class="card stat"><div class="label">Next 7 days</div><div class="value">${weekLive.length}</div><div class="sub">${weekLive.reduce((n, b) => n + b.party_size, 0)} covers</div></div>
    </div>
    <div class="dash-grid">
      <div class="card">
        <div class="card-head"><h3>Today · ${esc(fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3><a href="#/bookings">All bookings →</a></div>
        ${timeline}
      </div>
      <div class="card">
        <div class="card-head"><h3>Awaiting confirmation</h3></div>
        ${pendingList}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
async function viewBookings({ after }) {
  setActions('<button class="btn" id="new-booking" data-testid="new-booking">+ New booking</button>');
  $('#new-booking').onclick = () => newBooking();
  const f = state.bk;

  let q = sb.from('bookings').select(BOOKING_SELECT)
    .gte('booking_date', f.from).lte('booking_date', f.to)
    .order('booking_date').order('start_time');
  if (f.status === 'active') q = q.in('status', ACTIVE);
  else if (f.status !== 'all') q = q.eq('status', f.status);
  let rows = must(await q);

  if (f.q) {
    const needle = f.q.toLowerCase();
    rows = rows.filter((b) => [b.reference, b.customer?.full_name, b.customer?.email, b.customer?.phone]
      .some((v) => (v || '').toLowerCase().includes(needle)));
  }

  const t = today();
  const preset = f.from === t && f.to === t ? 'today'
    : f.from === addDays(t, 1) && f.to === addDays(t, 1) ? 'tomorrow'
    : f.from === t && f.to === addDays(t, 6) ? 'week' : '';

  let lastDate = null;
  const multiDay = f.from !== f.to;
  const body = rows.map((b) => {
    let group = '';
    if (multiDay && b.booking_date !== lastDate) {
      lastDate = b.booking_date;
      group = `<tr class="date-group"><td colspan="8">${esc(fmtDate(b.booking_date, { weekday: 'long', day: 'numeric', month: 'long' }))}</td></tr>`;
    }
    return `${group}
      <tr class="clickable ${['cancelled', 'no_show'].includes(b.status) ? 'dim' : ''}" data-booking-id="${b.id}">
        <td><strong>${esc(fmtTime(b.start_time))}</strong>${multiDay ? '' : `<div class="sub">until ${esc(fmtTime(b.end_time))}</div>`}</td>
        <td>
          <div class="guest-name">${esc(b.customer?.full_name)} ${b.customer?.is_vip ? '<span class="badge vip">VIP</span>' : ''}</div>
          <div class="sub">${esc(b.customer?.phone || b.customer?.email || '')}</div>
        </td>
        <td>${b.party_size}</td>
        <td>${b.table ? esc(b.table.name) : '<span class="sub">—</span>'}</td>
        <td>${statusSelect(b)}</td>
        <td><span class="sub">${esc(SOURCES[b.source] || b.source)}</span></td>
        <td class="mono">${esc(b.reference)}</td>
        <td>${b.special_requests || b.internal_notes ? `<span class="note-ico" title="${esc([b.special_requests, b.internal_notes].filter(Boolean).join(' | '))}">✎</span>` : ''}</td>
      </tr>`;
  }).join('');

  const covers = rows.filter((b) => !['cancelled', 'no_show'].includes(b.status)).reduce((n, b) => n + b.party_size, 0);

  after(bindBookingFilters);
  return `
    <div class="toolbar">
      <div class="seg" id="bk-presets">
        <button data-preset="today" class="${preset === 'today' ? 'active' : ''}">Today</button>
        <button data-preset="tomorrow" class="${preset === 'tomorrow' ? 'active' : ''}">Tomorrow</button>
        <button data-preset="week" class="${preset === 'week' ? 'active' : ''}">Next 7 days</button>
      </div>
      <label>From <input type="date" id="bk-from" value="${f.from}"></label>
      <label>To <input type="date" id="bk-to" value="${f.to}"></label>
      <label>Status
        <select id="bk-status" data-testid="filter-status">
          <option value="all">All</option>
          <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active (not finished)</option>
          ${STATUSES.map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}
        </select>
      </label>
      <label class="grow">Search <input type="search" id="bk-q" placeholder="Name, phone, email or reference" value="${esc(f.q)}" data-testid="filter-search"></label>
    </div>
    <div class="card">
      <div class="card-head"><h3>${rows.length} booking${rows.length === 1 ? '' : 's'} · ${covers} covers</h3></div>
      ${rows.length ? `
      <div class="table-wrap"><table class="data" data-testid="bookings-table">
        <thead><tr><th>Time</th><th>Guest</th><th>Guests</th><th>Table</th><th>Status</th><th>Source</th><th>Ref</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>` : '<div class="empty">No bookings match these filters.</div>'}
    </div>`;
}

function bindBookingFilters() {
  const f = state.bk;
  $$('#bk-presets [data-preset]').forEach((btn) => btn.onclick = () => {
    const t = today();
    const p = btn.dataset.preset;
    f.from = p === 'tomorrow' ? addDays(t, 1) : t;
    f.to = p === 'week' ? addDays(t, 6) : f.from;
    render();
  });
  $('#bk-from').onchange = (e) => { f.from = e.target.value || today(); if (f.to < f.from) f.to = f.from; render(); };
  $('#bk-to').onchange = (e) => { f.to = e.target.value || f.from; if (f.to < f.from) f.from = f.to; render(); };
  $('#bk-status').onchange = (e) => { f.status = e.target.value; render(); };
  let timer;
  $('#bk-q').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      f.q = e.target.value.trim();
      await render();
      const input = $('#bk-q');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 250);
  };
}

function tableOptions(selectedId, { includeAuto = true } = {}) {
  return `
    ${includeAuto ? '<option value="auto">Auto-assign best table</option>' : ''}
    <option value="" ${selectedId === null ? 'selected' : ''}>No table</option>
    ${state.tables.filter((t) => t.is_active || t.id === selectedId).map((t) =>
      `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.name)} · ${t.capacity} seats · ${esc(t.area)}</option>`).join('')}`;
}

function newBooking(prefill = {}) {
  const s = state.settings;
  openModal({
    title: 'New booking',
    submitLabel: 'Create booking',
    body: `
      <div class="grid-2">
        <label>Guest name <input name="full_name" required value="${esc(prefill.full_name || '')}" data-testid="nb-name"></label>
        <label>Phone <input name="phone" type="tel" value="${esc(prefill.phone || '')}" data-testid="nb-phone"></label>
      </div>
      <label>Email <input name="email" type="email" value="${esc(prefill.email || '')}" data-testid="nb-email"></label>
      <div class="grid-3">
        <label>Date <input name="date" type="date" required value="${today()}" data-testid="nb-date"></label>
        <label>Time <input name="time" type="time" required step="900" value="${esc(nextQuarterHour())}" data-testid="nb-time"></label>
        <label>Guests <input name="party_size" type="number" min="1" max="100" required value="2" data-testid="nb-party"></label>
      </div>
      <div class="grid-2">
        <label>Source
          <select name="source">
            <option value="phone">Phone</option>
            <option value="walk_in">Walk-in (seat now)</option>
            <option value="staff">Other / staff</option>
          </select>
        </label>
        <label>Table <select name="table_id">${tableOptions(undefined)}</select></label>
      </div>
      <label>Special requests <textarea name="special_requests" rows="2"></textarea></label>
      <p class="sub">Staff bookings skip opening-hour checks. Duration: ${s.booking_duration_minutes} min.</p>`,
    onSubmit: async (fd) => {
      const tableVal = fd.get('table_id');
      const data = must(await sb.rpc('create_booking', {
        p_date: fd.get('date'),
        p_time: fd.get('time'),
        p_party_size: Number(fd.get('party_size')),
        p_full_name: String(fd.get('full_name')).trim(),
        p_email: String(fd.get('email') || '').trim() || null,
        p_phone: String(fd.get('phone') || '').trim() || null,
        p_special_requests: String(fd.get('special_requests') || ''),
        p_source: fd.get('source'),
        p_table_id: tableVal && tableVal !== 'auto' ? tableVal : null,
      }));
      toast(`Booking ${data.reference} created`);
      if (tableVal === '') {
        // explicitly unassigned
        await sb.from('bookings').update({ table_id: null }).eq('reference', data.reference);
      }
      refreshPendingPill();
      render();
    },
  });
}

function nextQuarterHour() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: state.settings.timezone }));
  const mins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
  return addMinutes('00:00', Math.min(mins, 23 * 60 + 45));
}

async function editBooking(id) {
  const b = must(await sb.from('bookings').select(BOOKING_SELECT).eq('id', id).single());
  const c = b.customer || {};
  openModal({
    title: `Booking ${b.reference}`,
    deleteLabel: 'Delete booking',
    body: `
      <dl class="detail-list">
        <dt>Guest</dt><dd><a href="#" id="open-customer"><strong>${esc(c.full_name)}</strong></a> ${c.is_vip ? '<span class="badge vip">VIP</span>' : ''}
          ${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</dd>
        <dt>Contact</dt><dd>${esc([c.phone, c.email].filter(Boolean).join(' · ') || '—')}</dd>
        <dt>Source</dt><dd>${esc(SOURCES[b.source] || b.source)} · created ${esc(new Date(b.created_at).toLocaleString())}</dd>
      </dl>
      <div class="grid-3">
        <label>Date <input name="booking_date" type="date" required value="${b.booking_date}"></label>
        <label>Time <input name="start_time" type="time" required step="900" value="${b.start_time.slice(0, 5)}"></label>
        <label>Guests <input name="party_size" type="number" min="1" required value="${b.party_size}"></label>
      </div>
      <div class="grid-2">
        <label>Table <select name="table_id">${tableOptions(b.table_id)}</select></label>
        <label>Status <select name="status">${STATUSES.map((s) => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></label>
      </div>
      <label>Guest's special requests <textarea name="special_requests" rows="2">${esc(b.special_requests)}</textarea></label>
      <label>Internal notes <span class="muted">(staff only)</span> <textarea name="internal_notes" rows="2">${esc(b.internal_notes)}</textarea></label>`,
    onOpen: () => {
      $('#open-customer').onclick = (e) => {
        e.preventDefault();
        $('#modal').close();
        openCustomer(c.id);
      };
    },
    onSubmit: async (fd) => {
      const start = String(fd.get('start_time')).slice(0, 5);
      const tableVal = fd.get('table_id');
      const patch = {
        booking_date: fd.get('booking_date'),
        start_time: start,
        end_time: addMinutes(start, state.settings.booking_duration_minutes),
        party_size: Number(fd.get('party_size')),
        status: fd.get('status'),
        special_requests: String(fd.get('special_requests') || ''),
        internal_notes: String(fd.get('internal_notes') || ''),
      };
      // Keep the current duration if the booking was made with a different one.
      if (patch.booking_date === b.booking_date && start === b.start_time.slice(0, 5)) patch.end_time = b.end_time.slice(0, 5);

      if (tableVal === 'auto') {
        // free the table first so the overlap guard doesn't block a move
        must(await sb.from('bookings').update({ ...patch, table_id: null }).eq('id', b.id));
        const assigned = must(await sb.rpc('auto_assign_table', { p_booking_id: b.id }));
        if (!assigned && ACTIVE.includes(patch.status)) toast('No free table fits – booking left unassigned', 'error');
      } else {
        must(await sb.from('bookings').update({ ...patch, table_id: tableVal || null }).eq('id', b.id));
      }
      toast('Booking updated');
      refreshPendingPill();
      render();
    },
    onDelete: async () => {
      must(await sb.from('bookings').delete().eq('id', b.id));
      toast('Booking deleted');
      refreshPendingPill();
      render();
    },
  });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
let customerQuery = '';
async function viewCustomers({ after }) {
  setActions('<button class="btn" id="add-customer">+ Add customer</button>');
  $('#add-customer').onclick = () => openCustomer(null);

  let q = sb.from('customer_stats').select('*').order('created_at', { ascending: false }).limit(300);
  const term = customerQuery.replace(/[,()%*\\]/g, ' ').trim();
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const rows = must(await q);

  after(() => {
    let timer;
    $('#cust-q').oninput = (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        customerQuery = e.target.value;
        await render();
        const input = $('#cust-q');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }, 250);
    };
    $$('[data-customer-id]').forEach((tr) => tr.onclick = () => openCustomer(tr.dataset.customerId));
  });

  return `
    <div class="toolbar">
      <label class="grow">Search <input type="search" id="cust-q" placeholder="Name, email or phone" value="${esc(customerQuery)}" data-testid="customer-search"></label>
    </div>
    <div class="card">
      <div class="card-head"><h3>${rows.length} customer${rows.length === 1 ? '' : 's'}</h3></div>
      ${rows.length ? `<div class="table-wrap"><table class="data" data-testid="customers-table">
        <thead><tr><th>Name</th><th>Contact</th><th>Visits</th><th>Bookings</th><th>No-shows</th><th>Last visit</th><th>Next booking</th><th>Tags</th></tr></thead>
        <tbody>${rows.map((c) => `
          <tr class="clickable" data-customer-id="${c.id}">
            <td><span class="guest-name">${esc(c.full_name)}</span> ${c.is_vip ? '<span class="badge vip">VIP</span>' : ''}</td>
            <td><div>${esc(c.email || '')}</div><div class="sub">${esc(c.phone || '')}</div></td>
            <td>${c.visits}</td>
            <td>${c.total_bookings}</td>
            <td>${c.no_shows ? `<span class="badge no_show">${c.no_shows}</span>` : '0'}</td>
            <td>${c.last_visit ? esc(fmtDate(c.last_visit)) : '<span class="sub">—</span>'}</td>
            <td>${c.next_booking ? esc(fmtDate(c.next_booking)) : '<span class="sub">—</span>'}</td>
            <td>${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No customers yet. They are created automatically when guests book.</div>'}
    </div>`;
}

async function openCustomer(id) {
  const c = id ? must(await sb.from('customer_stats').select('*').eq('id', id).single()) : { full_name: '', email: '', phone: '', notes: '', tags: [], is_vip: false };
  const history = id ? must(await sb.from('bookings').select('*, table:restaurant_tables(name)').eq('customer_id', id)
    .order('booking_date', { ascending: false }).order('start_time', { ascending: false })) : [];

  openModal({
    title: id ? c.full_name : 'Add customer',
    deleteLabel: 'Delete customer',
    body: `
      ${id ? `<dl class="detail-list">
        <dt>Visits</dt><dd>${c.visits} completed · ${c.total_bookings} bookings · ${c.no_shows} no-shows · ${c.cancellations} cancelled</dd>
        <dt>Customer since</dt><dd>${esc(new Date(c.created_at).toLocaleDateString())}</dd>
      </dl>` : ''}
      <div class="grid-2">
        <label>Full name <input name="full_name" required value="${esc(c.full_name)}"></label>
        <label>Phone <input name="phone" value="${esc(c.phone || '')}"></label>
      </div>
      <label>Email <input name="email" type="email" value="${esc(c.email || '')}"></label>
      <label>Tags <span class="muted">(comma separated, e.g. allergy-nuts, anniversary, regular)</span>
        <input name="tags" value="${esc((c.tags || []).join(', '))}"></label>
      <label>Notes <textarea name="notes" rows="3" placeholder="Preferences, allergies, seating…">${esc(c.notes)}</textarea></label>
      <label class="check-label"><input type="checkbox" name="is_vip" ${c.is_vip ? 'checked' : ''}> VIP guest</label>
      ${id ? `
        <div class="section-title">Booking history</div>
        ${history.length ? `<table class="data">
          <thead><tr><th>Date</th><th>Time</th><th>Guests</th><th>Table</th><th>Status</th></tr></thead>
          <tbody>${history.map((b) => `<tr>
            <td>${esc(fmtDate(b.booking_date))}</td><td>${esc(fmtTime(b.start_time))}</td><td>${b.party_size}</td>
            <td>${esc(b.table?.name || '—')}</td><td>${statusBadge(b.status)}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="sub">No bookings yet.</p>'}
        <p><button type="button" class="btn btn-ghost btn-sm" id="book-for-customer">+ New booking for this guest</button></p>` : ''}`,
    onOpen: () => {
      const btn = $('#book-for-customer');
      if (btn) btn.onclick = () => { $('#modal').close(); newBooking(c); };
    },
    onSubmit: async (fd) => {
      const row = {
        full_name: String(fd.get('full_name')).trim(),
        email: String(fd.get('email') || '').trim().toLowerCase() || null,
        phone: String(fd.get('phone') || '').trim() || null,
        notes: String(fd.get('notes') || ''),
        tags: String(fd.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean),
        is_vip: fd.get('is_vip') === 'on',
      };
      if (!row.full_name) throw new Error('Name is required');
      if (id) must(await sb.from('customers').update(row).eq('id', id));
      else must(await sb.from('customers').insert(row));
      toast('Customer saved');
      render();
    },
    onDelete: id && !c.total_bookings ? async () => {
      must(await sb.from('customers').delete().eq('id', id));
      toast('Customer deleted');
      render();
    } : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
async function viewTables({ after }) {
  setActions('<button class="btn" id="add-table" data-testid="add-table">+ Add table</button>');
  $('#add-table').onclick = () => editTable(null);
  await loadTables();
  const seats = state.tables.filter((t) => t.is_active).reduce((n, t) => n + t.capacity, 0);

  after(() => $$('[data-table-id]').forEach((tr) => tr.onclick = () => editTable(tr.dataset.tableId)));
  return `
    <div class="card">
      <div class="card-head"><h3>${state.tables.length} tables · ${seats} active seats</h3></div>
      ${state.tables.length ? `<div class="table-wrap"><table class="data" data-testid="tables-table">
        <thead><tr><th>Name</th><th>Seats</th><th>Area</th><th>Status</th></tr></thead>
        <tbody>${state.tables.map((t) => `
          <tr class="clickable ${t.is_active ? '' : 'dim'}" data-table-id="${t.id}">
            <td><strong>${esc(t.name)}</strong></td><td>${t.capacity}</td><td>${esc(t.area)}</td>
            <td>${t.is_active ? '<span class="badge completed">Active</span>' : '<span class="badge">Inactive</span>'}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Add your tables so online bookings can be accepted.</div>'}
    </div>
    <p class="sub">Online bookings are assigned to the smallest free active table that fits the party.</p>`;
}

function editTable(id) {
  const t = id ? state.tables.find((x) => x.id === id) : { name: '', capacity: 4, area: 'Main', is_active: true };
  openModal({
    title: id ? `Table ${t.name}` : 'Add table',
    body: `
      <div class="grid-3">
        <label>Name <input name="name" required value="${esc(t.name)}"></label>
        <label>Seats <input name="capacity" type="number" min="1" max="100" required value="${t.capacity}"></label>
        <label>Area <input name="area" value="${esc(t.area)}" list="areas"></label>
      </div>
      <datalist id="areas">${[...new Set(state.tables.map((x) => x.area))].map((a) => `<option value="${esc(a)}">`).join('')}</datalist>
      <label class="check-label"><input type="checkbox" name="is_active" ${t.is_active ? 'checked' : ''}> Available for bookings</label>`,
    onSubmit: async (fd) => {
      const row = {
        name: String(fd.get('name')).trim(),
        capacity: Number(fd.get('capacity')),
        area: String(fd.get('area') || 'Main').trim() || 'Main',
        is_active: fd.get('is_active') === 'on',
      };
      if (!row.name) throw new Error('Name is required');
      if (id) must(await sb.from('restaurant_tables').update(row).eq('id', id));
      else must(await sb.from('restaurant_tables').insert(row));
      toast('Table saved');
      render();
    },
    onDelete: id ? async () => {
      must(await sb.from('restaurant_tables').delete().eq('id', id));
      toast('Table deleted');
      render();
    } : undefined,
  });
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
let menuCache = [];
async function viewMenu({ after }) {
  setActions('<button class="btn" id="add-item" data-testid="add-menu-item">+ Add dish</button>');
  $('#add-item').onclick = () => editMenuItem(null);
  menuCache = must(await sb.from('menu_items').select('*').order('category').order('sort_order').order('name'));
  const groups = Object.groupBy ? Object.groupBy(menuCache, (i) => i.category)
    : menuCache.reduce((g, i) => ((g[i.category] ||= []).push(i), g), {});

  after(() => $$('[data-item-id]').forEach((tr) => tr.onclick = () => editMenuItem(tr.dataset.itemId)));
  return Object.keys(groups).length ? Object.entries(groups).map(([cat, items]) => `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>${esc(cat)}</h3><span class="sub">${items.length} items</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th style="width:40%">Dish</th><th>Price</th><th>Order</th><th>Featured</th><th>Visible</th></tr></thead>
        <tbody>${items.map((i) => `
          <tr class="clickable ${i.is_active ? '' : 'dim'}" data-item-id="${i.id}">
            <td><div class="guest-name">${esc(i.name)}</div><div class="sub">${esc(i.description)}</div></td>
            <td>${money(i.price)}</td><td>${i.sort_order}</td>
            <td>${i.is_featured ? '★' : ''}</td>
            <td>${i.is_active ? 'Yes' : 'Hidden'}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>`).join('') : '<div class="card empty">No dishes yet.</div>';
}

function editMenuItem(id) {
  const i = id ? menuCache.find((x) => x.id === id)
    : { category: 'Mains', name: '', description: '', price: 0, is_featured: false, is_active: true, sort_order: 0 };
  const cats = [...new Set(menuCache.map((x) => x.category))];
  openModal({
    title: id ? i.name : 'Add dish',
    body: `
      <div class="grid-2">
        <label>Name <input name="name" required value="${esc(i.name)}"></label>
        <label>Category <input name="category" required value="${esc(i.category)}" list="cats"></label>
      </div>
      <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label>Description <textarea name="description" rows="2">${esc(i.description)}</textarea></label>
      <div class="grid-2">
        <label>Price <input name="price" type="number" min="0" step="0.01" required value="${i.price}"></label>
        <label>Sort order <input name="sort_order" type="number" value="${i.sort_order}"></label>
      </div>
      <label class="check-label"><input type="checkbox" name="is_featured" ${i.is_featured ? 'checked' : ''}> Featured (shown in Highlights)</label>
      <label class="check-label"><input type="checkbox" name="is_active" ${i.is_active ? 'checked' : ''}> Visible on website</label>`,
    onSubmit: async (fd) => {
      const row = {
        name: String(fd.get('name')).trim(),
        category: String(fd.get('category')).trim(),
        description: String(fd.get('description') || '').trim(),
        price: Number(fd.get('price')),
        sort_order: Number(fd.get('sort_order') || 0),
        is_featured: fd.get('is_featured') === 'on',
        is_active: fd.get('is_active') === 'on',
      };
      if (!row.name || !row.category) throw new Error('Name and category are required');
      if (id) must(await sb.from('menu_items').update(row).eq('id', id));
      else must(await sb.from('menu_items').insert(row));
      toast('Menu updated');
      render();
    },
    onDelete: id ? async () => {
      must(await sb.from('menu_items').delete().eq('id', id));
      toast('Dish deleted');
      render();
    } : undefined,
  });
}

// ---------------------------------------------------------------------------
// Website settings
// ---------------------------------------------------------------------------
async function viewWebsite({ after }) {
  await loadSettings();
  const s = state.settings;
  const field = (name, lbl, type = 'text', extra = '') =>
    `<label>${lbl} <input name="${name}" type="${type}" value="${esc(s[name])}" ${extra}></label>`;
  const area = (name, lbl, rows = 3) => `<label>${lbl} <textarea name="${name}" rows="${rows}">${esc(s[name])}</textarea></label>`;

  after(() => {
    $('#settings-form').onsubmit = saveSettings;
    bindLogoField();
    $$('.hours-row input[type=checkbox]').forEach((cb) => cb.onchange = () => {
      $$(`[data-day="${cb.dataset.day}"] input[type=time]`).forEach((inp) => (inp.disabled = cb.checked));
    });
  });

  return `
    <form id="settings-form" novalidate>
      <div class="settings-grid">
        <div class="stack">
          <div class="card"><div class="card-head"><h3>Branding & homepage</h3></div><div class="card-body">
            <div class="logo-field">
              <img id="logo-preview" src="${esc(s.logo_url || '/img/logo.svg')}" alt="Logo preview">
              <div class="logo-controls">
                <label>Logo
                  <input name="logo_url" id="logo-url" value="${esc(s.logo_url)}" placeholder="/img/logo.svg" data-testid="set-logo-url">
                </label>
                <div class="logo-actions">
                  <label class="btn btn-ghost btn-sm" style="margin:0">Upload image
                    <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden data-testid="logo-upload">
                  </label>
                  <button type="button" class="btn btn-ghost btn-sm" id="logo-reset">Use default</button>
                  <span class="sub">PNG, JPG, WebP or SVG · max 2 MB</span>
                </div>
              </div>
            </div>
            ${field('restaurant_name', 'Restaurant name', 'text', 'required data-testid="set-name"')}
            ${field('tagline', 'Tagline')}
            ${field('hero_title', 'Hero headline')}
            ${area('hero_subtitle', 'Hero text', 2)}
            ${field('hero_image_url', 'Hero image URL', 'url')}
            ${field('about_title', 'About heading')}
            ${area('about_text', 'About text', 5)}
          </div></div>
          <div class="card"><div class="card-head"><h3>Contact</h3></div><div class="card-body">
            ${field('address', 'Address')}
            <div class="grid-2">${field('phone', 'Phone')}${field('email', 'Email', 'email')}</div>
          </div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3>Opening hours</h3></div><div class="card-body">
            ${DAYS.map(([key, name]) => {
              const h = s.opening_hours?.[key] || { closed: true, open: '12:00', close: '22:00' };
              return `<div class="hours-row" data-day="${key}">
                <strong>${name}</strong>
                <label class="check-label" style="margin:0"><input type="checkbox" data-day="${key}" name="closed_${key}" ${h.closed ? 'checked' : ''}> Closed</label>
                <input type="time" name="open_${key}" value="${esc(h.open)}" ${h.closed ? 'disabled' : ''} aria-label="${name} opens">
                <input type="time" name="close_${key}" value="${esc(h.close)}" ${h.closed ? 'disabled' : ''} aria-label="${name} closes">
              </div>`;
            }).join('')}
            <p class="sub">The last online booking starts one booking-duration before closing.</p>
          </div></div>
          <div class="card"><div class="card-head"><h3>Online booking rules</h3></div><div class="card-body">
            <label class="check-label"><input type="checkbox" name="booking_enabled" ${s.booking_enabled ? 'checked' : ''}> Accept online bookings</label>
            <label class="check-label"><input type="checkbox" name="auto_confirm" ${s.auto_confirm ? 'checked' : ''}> Auto-confirm bookings (otherwise they wait as “pending”)</label>
            <div class="grid-2">
              ${field('booking_duration_minutes', 'Table time per booking (min)', 'number', 'min="15" max="480"')}
              ${field('slot_interval_minutes', 'Slot interval (min)', 'number', 'min="5" max="120"')}
              ${field('max_party_size', 'Max party size online', 'number', 'min="1" max="100"')}
              ${field('booking_window_days', 'Book up to (days ahead)', 'number', 'min="1" max="365"')}
              ${field('min_notice_minutes', 'Minimum notice (min)', 'number', 'min="0"')}
              ${field('timezone', 'Timezone')}
            </div>
          </div></div>
        </div>
      </div>
      <div class="sticky-save">
        <a class="btn btn-ghost" href="/" target="_blank" rel="noopener">Preview website ↗</a>
        <button class="btn" type="submit" data-testid="save-settings">Save changes</button>
      </div>
    </form>`;
}

const DEFAULT_LOGO = '/img/logo.svg';

function bindLogoField() {
  const url = $('#logo-url');
  const preview = $('#logo-preview');
  const show = () => { preview.src = url.value.trim() || DEFAULT_LOGO; };
  url.oninput = show;
  preview.onerror = () => { preview.src = DEFAULT_LOGO; };
  $('#logo-reset').onclick = () => { url.value = DEFAULT_LOGO; show(); };

  $('#logo-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Logo must be 2 MB or smaller', 'error');

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `logos/logo-${Date.now()}.${ext}`;
    toast('Uploading logo…');
    const { error } = await sb.storage.from('site-assets').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) return toast(errMsg(error), 'error');
    url.value = sb.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
    show();
    toast('Logo uploaded – click “Save changes” to publish it');
  };
}

async function saveSettings(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const text = (k) => String(fd.get(k) ?? '').trim();
  const num = (k) => Number(fd.get(k));

  const hours = {};
  for (const [key, name] of DAYS) {
    const closed = fd.get(`closed_${key}`) === 'on';
    const open = text(`open_${key}`) || state.settings.opening_hours?.[key]?.open || '12:00';
    const close = text(`close_${key}`) || state.settings.opening_hours?.[key]?.close || '22:00';
    if (!closed && close <= open) return toast(`${name}: closing time must be after opening time`, 'error');
    hours[key] = { closed, open, close };
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: text('timezone') });
  } catch {
    return toast('Unknown timezone – use a name like Asia/Singapore', 'error');
  }

  const patch = {
    restaurant_name: text('restaurant_name'),
    logo_url: text('logo_url') || DEFAULT_LOGO,
    tagline: text('tagline'),
    hero_title: text('hero_title'),
    hero_subtitle: text('hero_subtitle'),
    hero_image_url: text('hero_image_url'),
    about_title: text('about_title'),
    about_text: text('about_text'),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    timezone: text('timezone'),
    opening_hours: hours,
    booking_enabled: fd.get('booking_enabled') === 'on',
    auto_confirm: fd.get('auto_confirm') === 'on',
    booking_duration_minutes: num('booking_duration_minutes'),
    slot_interval_minutes: num('slot_interval_minutes'),
    max_party_size: num('max_party_size'),
    booking_window_days: num('booking_window_days'),
    min_notice_minutes: num('min_notice_minutes'),
  };
  if (!patch.restaurant_name) return toast('Restaurant name is required', 'error');

  const { error } = await sb.from('site_settings').update(patch).eq('id', 1);
  if (error) return toast(errMsg(error), 'error');
  toast('Website updated');
  render();
}

// ---------------------------------------------------------------------------
// Staff (admin)
// ---------------------------------------------------------------------------
async function viewStaff({ after }) {
  setActions('<button class="btn" id="invite">+ Invite staff</button>');
  $('#invite').onclick = inviteStaff;
  const [staff, invites] = await Promise.all([
    sb.from('staff').select('*').order('created_at').then(must),
    sb.from('staff_invites').select('*').order('created_at').then(must),
  ]);

  after(() => {
    $$('[data-role-for]').forEach((sel) => sel.onchange = async () => {
      const { error } = await sb.from('staff').update({ role: sel.value }).eq('user_id', sel.dataset.roleFor);
      if (error) toast(errMsg(error), 'error');
      else toast('Role updated');
      render();
    });
    $$('[data-remove-staff]').forEach((btn) => btn.onclick = async () => {
      if (!confirm('Remove CRM access for this person?')) return;
      const { error } = await sb.from('staff').delete().eq('user_id', btn.dataset.removeStaff);
      if (error) toast(errMsg(error), 'error');
      render();
    });
    $$('[data-revoke]').forEach((btn) => btn.onclick = async () => {
      const { error } = await sb.from('staff_invites').delete().eq('email', btn.dataset.revoke);
      if (error) toast(errMsg(error), 'error');
      render();
    });
  });

  return `
    <div class="card" style="margin-bottom:20px">
      <div class="card-head"><h3>Team</h3></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th><th></th></tr></thead>
        <tbody>${staff.map((m) => {
          const self = m.user_id === state.me.user_id;
          return `<tr>
            <td><strong>${esc(m.full_name || '—')}</strong> ${self ? '<span class="sub">(you)</span>' : ''}</td>
            <td>${esc(m.email)}</td>
            <td>${self ? statusBadge(m.role) : `<select class="status-select" data-role-for="${m.user_id}">
              <option value="staff" ${m.role === 'staff' ? 'selected' : ''}>staff</option>
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>admin</option></select>`}</td>
            <td>${esc(new Date(m.created_at).toLocaleDateString())}</td>
            <td class="actions">${self ? '' : `<button class="btn btn-danger btn-sm" data-remove-staff="${m.user_id}">Remove</button>`}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Pending invites</h3></div>
      ${invites.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Email</th><th>Role</th><th>Invited</th><th></th></tr></thead>
        <tbody>${invites.map((i) => `<tr>
          <td>${esc(i.email)}</td><td>${statusBadge(i.role)}</td><td>${esc(new Date(i.created_at).toLocaleDateString())}</td>
          <td class="actions"><button class="btn btn-ghost btn-sm" data-revoke="${esc(i.email)}">Revoke</button></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No pending invites.</div>'}
    </div>
    <p class="sub">Invited people sign up at <code>${esc(location.origin)}/crm</code> with the invited email address and get access automatically.</p>`;
}

function inviteStaff() {
  openModal({
    title: 'Invite staff member',
    submitLabel: 'Send invite',
    body: `
      <label>Email <input name="email" type="email" required></label>
      <label>Role <select name="role"><option value="staff">Staff – bookings, customers, menu, website</option><option value="admin">Admin – also manages staff</option></select></label>`,
    onSubmit: async (fd) => {
      const email = String(fd.get('email')).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email');
      must(await sb.from('staff_invites').upsert({ email, role: fd.get('role') }));
      toast(`Invite added for ${email}`);
      render();
    },
  });
}
