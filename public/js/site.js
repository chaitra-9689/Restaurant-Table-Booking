import { getClient, esc, DAYS, todayIn, addDays, fmtDate, fmtTime, money, errMsg } from './common.js';

const sb = getClient({ guest: true });
const $ = (s) => document.querySelector(s);

let settings = null;
let chosen = { date: null, time: null, party: 2 };

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
function bindSettings(s) {
  document.title = `${s.restaurant_name} – Book a Table`;
  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.textContent = s[el.dataset.bind] ?? '';
  });
  document.querySelectorAll('[data-bind-href]').forEach((el) => {
    const v = s[el.dataset.bind] ?? '';
    el.href = el.dataset.bindHref === 'tel' ? `tel:${v.replace(/[^\d+]/g, '')}` : `mailto:${v}`;
  });
  const logo = s.logo_url || '/img/logo.svg';
  document.querySelectorAll('[data-bind-src="logo_url"]').forEach((img) => {
    img.src = logo;
    img.alt = `${s.restaurant_name} logo`;
  });
  $('#favicon').href = logo;
  if (s.hero_image_url) $('#hero').style.backgroundImage = `url("${encodeURI(s.hero_image_url)}")`;
  $('#year').textContent = new Date().getFullYear();

  const todayKey = DAYS[(new Date(todayIn(s.timezone) + 'T00:00:00Z').getUTCDay() + 6) % 7][0];
  $('#hours').innerHTML = DAYS.map(([key, label]) => {
    const h = s.opening_hours?.[key];
    const text = !h || h.closed ? 'Closed' : `${fmtTime(h.open)} – ${fmtTime(h.close)}`;
    return `<tr class="${key === todayKey ? 'today' : ''}"><td>${label}</td><td>${esc(text)}</td></tr>`;
  }).join('');
}

function renderMenu(items) {
  // Natural course order first, then anything custom alphabetically.
  const COURSE_ORDER = ['starters', 'small plates', 'salads', 'pasta', 'pizza', 'mains', 'sides', 'desserts', 'drinks'];
  const rank = (c) => { const i = COURSE_ORDER.indexOf(c.toLowerCase()); return i === -1 ? 99 : i; };
  const categories = [...new Set(items.map((i) => i.category))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const tabs = ['Highlights', ...categories];
  let active = items.some((i) => i.is_featured) ? 'Highlights' : categories[0];

  const draw = () => {
    $('#menu-tabs').innerHTML = tabs
      .filter((t) => t !== 'Highlights' || items.some((i) => i.is_featured))
      .map((t) => `<button class="menu-tab" role="tab" aria-selected="${t === active}" data-tab="${esc(t)}">${esc(t)}</button>`)
      .join('');
    const list = active === 'Highlights' ? items.filter((i) => i.is_featured) : items.filter((i) => i.category === active);
    $('#menu-grid').innerHTML = list.map((i) => `
      <div class="menu-item">
        <h4>${esc(i.name)}${i.is_featured && active !== 'Highlights' ? '<span class="badge">Chef’s pick</span>' : ''}</h4>
        <span class="price">${money(i.price)}</span>
        ${i.description ? `<p>${esc(i.description)}</p>` : ''}
      </div>`).join('') || '<p class="muted center">Menu coming soon.</p>';
  };

  $('#menu-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    active = tab.dataset.tab;
    draw();
  });
  draw();
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
function showError(msg) {
  const el = $('#form-error');
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function setupBookingForm(s) {
  if (!s.booking_enabled) {
    $('#booking-form').classList.add('hidden');
    $('#booking-disabled').classList.remove('hidden');
    return;
  }
  const today = todayIn(s.timezone);
  const dateInput = $('#b-date');
  dateInput.min = today;
  dateInput.max = addDays(today, s.booking_window_days);
  dateInput.value = today;

  const party = $('#b-party');
  party.innerHTML = Array.from({ length: s.max_party_size }, (_, i) =>
    `<option value="${i + 1}" ${i + 1 === 2 ? 'selected' : ''}>${i + 1} ${i ? 'guests' : 'guest'}</option>`).join('');

  dateInput.addEventListener('change', loadSlots);
  party.addEventListener('change', loadSlots);

  $('#slots').addEventListener('click', (e) => {
    const btn = e.target.closest('.slot');
    if (!btn) return;
    chosen = { date: dateInput.value, time: btn.dataset.time, party: Number(party.value) };
    $('#chosen-summary').textContent =
      `${fmtDate(chosen.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtTime(chosen.time)} · ${chosen.party} ${chosen.party > 1 ? 'guests' : 'guest'}`;
    $('#step-1').classList.add('hidden');
    $('#step-2').classList.remove('hidden');
    showError('');
    $('#step-2 input[name=full_name]').focus();
  });

  $('#back-btn').addEventListener('click', () => {
    $('#step-2').classList.add('hidden');
    $('#step-1').classList.remove('hidden');
    showError('');
    loadSlots();
  });

  $('#booking-form').addEventListener('submit', submitBooking);
  $('#new-booking-btn').addEventListener('click', () => {
    $('#booking-form').reset();
    dateInput.value = today;
    party.value = '2';
    $('#confirmation').classList.add('hidden');
    $('#booking-form').classList.remove('hidden');
    $('#step-2').classList.add('hidden');
    $('#step-1').classList.remove('hidden');
    loadSlots();
  });

  loadSlots();
}

let slotRequest = 0;
async function loadSlots() {
  const date = $('#b-date').value;
  const party = Number($('#b-party').value);
  const box = $('#slots');
  showError('');
  if (!date) {
    box.innerHTML = '<p class="muted small">Pick a date to see available times.</p>';
    return;
  }
  const req = ++slotRequest;
  box.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  const { data, error } = await sb.rpc('get_available_slots', { p_date: date, p_party_size: party });
  if (req !== slotRequest) return; // a newer request superseded this one
  if (error) {
    box.innerHTML = `<p class="muted small">Couldn't load times: ${esc(errMsg(error))}</p>`;
    return;
  }
  if (!data.length) {
    const h = settings.opening_hours?.[DAYS[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7][0]];
    box.innerHTML = `<p class="muted small">${h?.closed ? 'We’re closed on this day.' : 'No tables available for this date and party size. Please try another day.'}</p>`;
    return;
  }
  box.innerHTML = data.map(({ slot }) =>
    `<button type="button" class="slot" data-time="${esc(slot.slice(0, 5))}">${esc(fmtTime(slot))}</button>`).join('');
}

async function submitBooking(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const name = String(fd.get('full_name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const phone = String(fd.get('phone') || '').trim();

  if (name.length < 2) return showError('Please enter your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError('Please enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 6) return showError('Please enter a valid phone number.');

  const btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = 'Booking…';
  showError('');

  const { data, error } = await sb.rpc('create_booking', {
    p_date: chosen.date,
    p_time: chosen.time,
    p_party_size: chosen.party,
    p_full_name: name,
    p_email: email,
    p_phone: phone,
    p_special_requests: String(fd.get('special_requests') || ''),
  });

  btn.disabled = false;
  btn.textContent = 'Confirm booking';
  if (error) return showError(errMsg(error));

  form.classList.add('hidden');
  $('#confirmation').classList.remove('hidden');
  $('#conf-title').textContent = data.status === 'pending' ? 'Request received!' : 'You’re booked!';
  $('#conf-detail').textContent =
    `${fmtDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtTime(data.time)} for ${data.party_size}.` +
    (data.status === 'pending' ? ' We’ll confirm your table shortly.' : '');
  $('#conf-ref').textContent = data.reference;
}

// ---------------------------------------------------------------------------
(async function init() {
  const [{ data: s, error }, { data: menu }] = await Promise.all([
    sb.from('site_settings').select('*').eq('id', 1).single(),
    sb.from('menu_items').select('*').eq('is_active', true).order('category').order('sort_order'),
  ]);
  if (error) {
    $('#slots').innerHTML = `<p class="muted small">${esc(errMsg(error))}</p>`;
    return;
  }
  settings = s;
  bindSettings(s);
  renderMenu(menu || []);
  setupBookingForm(s);
})();
