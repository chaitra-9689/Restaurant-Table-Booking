// End-to-end suite for the public website and the CRM.
// Runs serially in ONE browser context so the whole run is a single screen recording.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const cases = require('./test-cases');
const { anonRest, ADMIN_EMAIL, STATE_DIR, ROOT } = require('./support/db');

test.describe.configure({ mode: 'serial' });

const SS_DIR = path.join(ROOT, 'testing_ss');
const RAW_VIDEO_DIR = path.join(ROOT, 'testing_recording', 'raw');
const DESKTOP = { width: 1280, height: 800 };

/** @type {import('@playwright/test').BrowserContext} */ let context;
/** @type {import('@playwright/test').Page} */ let page;
let settings;
let stepNo = 0;
let currentId = '';
const S = {}; // values shared between dependent tests (references, dates)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
const tc = (id, fn) => test(`${id} ${byId[id].title}`, fn);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function snap(label) {
  stepNo += 1;
  await page.screenshot({ path: path.join(SS_DIR, `${currentId}_step${stepNo}_${slug(label)}.png`) });
}

const toast = (text) => expect(page.locator('.toast').filter({ hasText: text }).first()).toBeVisible();

function todayIn(tz, offset = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + offset * 86400000));
}
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const dayKey = (iso) => DAY_KEYS[new Date(iso + 'T00:00:00Z').getUTCDay()];
const isOpen = (iso) => !settings.opening_hours?.[dayKey(iso)]?.closed;

function openDay(minOffset, exclude = []) {
  for (let i = minOffset; i < minOffset + 14; i++) {
    const d = todayIn(settings.timezone, i);
    if (isOpen(d) && !exclude.includes(d)) return d;
  }
  throw new Error('No open day found in the next two weeks');
}
function closedDay() {
  for (let i = 1; i <= 7; i++) {
    const d = todayIn(settings.timezone, i);
    if (!isOpen(d)) return d;
  }
  return null;
}

async function pickDateAndParty(date, party) {
  await page.locator('#book').scrollIntoViewIfNeeded();
  // wait for the form to be initialised from site settings, otherwise it resets the date to today
  await expect(page.locator('#b-party option')).toHaveCount(settings.max_party_size);
  await page.getByTestId('booking-date').fill(date);
  await page.getByTestId('booking-party').selectOption(String(party));
  await expect(page.locator('#slots .slot').first()).toBeVisible();
}

async function fillGuest({ name, phone, email, requests = '' }) {
  await page.getByTestId('booking-name').fill(name);
  await page.getByTestId('booking-phone').fill(phone);
  await page.getByTestId('booking-email').fill(email);
  await page.getByTestId('booking-requests').fill(requests);
}

// Opens a CRM page from a fresh load, so no re-render from a previous action can replace the form mid-test.
async function crm(route) {
  const url = `/crm#/${route}`;
  if (page.url().endsWith(url)) await page.reload();
  else await page.goto(url);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator(`.side-nav a[data-route="${route}"]`)).toHaveClass(/active/);
  if (route === 'website') await expect(page.locator('#settings-form')).toBeVisible();
}

async function saveSettings() {
  await page.getByTestId('save-settings').click();
  await toast('Website updated');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
test.beforeAll(async ({ browser }, workerInfo) => {
  context = await browser.newContext({
    baseURL: workerInfo.project.use.baseURL,
    viewport: DESKTOP,
    recordVideo: { dir: RAW_VIDEO_DIR, size: DESKTOP },
  });
  page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  const res = await anonRest('site_settings?select=*&id=eq.1');
  settings = res.body[0];
});

test.beforeEach(async ({}, testInfo) => {
  currentId = testInfo.title.split(' ')[0];
  stepNo = 0;
});

test.afterEach(async ({}, testInfo) => {
  const status = testInfo.status === testInfo.expectedStatus ? 'PASS' : 'FAIL';
  await page.screenshot({ path: path.join(SS_DIR, `${currentId}_${status}_${slug(byId[currentId].title)}.png`) }).catch(() => {});
});

test.afterAll(async () => {
  const video = page.video();
  await context.close();
  if (video) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATE_DIR, 'video.json'), JSON.stringify({ path: await video.path() }));
  }
});

// ---------------------------------------------------------------------------
// Public website
// ---------------------------------------------------------------------------
tc('TC01', async () => {
  await page.goto('/');
  await expect(page).toHaveTitle(`${settings.restaurant_name} – Book a Table`);
  await expect(page.locator('.nav .brand-logo')).toBeVisible();
  await expect(page.locator('.nav [data-bind="restaurant_name"]')).toHaveText(settings.restaurant_name);
  await expect(page.locator('.hero [data-bind="tagline"]')).toHaveText(settings.tagline);
  await expect(page.locator('.hero h1')).toHaveText(settings.hero_title);
  await expect(page.getByTestId('hero-book')).toBeVisible();
});

tc('TC02', async () => {
  await page.locator('.nav-links a[href="#menu"]').click();
  await expect(page.locator('#menu h2')).toBeInViewport();
  await snap('menu section');
  await page.locator('.nav-links a[href="#visit"]').click();
  await expect(page.locator('#hours')).toBeInViewport();
  await snap('visit section');
  await page.locator('.nav-links a.btn').click();
  await expect(page.locator('#booking-card')).toBeInViewport();
});

tc('TC03', async () => {
  await page.locator('#menu').scrollIntoViewIfNeeded();
  await expect(page.locator('.menu-tab[data-tab="Highlights"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#menu-grid .menu-item').first()).toBeVisible();
  await snap('highlights');
  await page.locator('.menu-tab[data-tab="Pasta"]').click();
  await expect(page.locator('.menu-tab[data-tab="Pasta"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#menu-grid')).toContainText('Cacio e pepe');
  await expect(page.locator('#menu-grid')).not.toContainText('Tiramisù');
  await expect(page.locator('#menu-grid .price').first()).toHaveText(/^\d+\.\d{2}$/);
  await snap('pasta tab');
  await page.locator('.menu-tab[data-tab="Desserts"]').click();
  await expect(page.locator('#menu-grid')).toContainText('Tiramisù');
});

tc('TC04', async () => {
  await page.locator('#visit').scrollIntoViewIfNeeded();
  await expect(page.locator('#hours tr')).toHaveCount(7);
  const monday = page.locator('#hours tr', { hasText: 'Monday' });
  if (settings.opening_hours.mon.closed) await expect(monday).toContainText('Closed');
  else await expect(monday).not.toContainText('Closed');
  await expect(page.locator('#visit a[href^="tel:"]')).toHaveText(settings.phone);
  await expect(page.locator('#visit a[href^="mailto:"]')).toHaveText(settings.email);
});

tc('TC05', async () => {
  await page.locator('#book').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('booking-date')).toHaveValue(todayIn(settings.timezone));
  await expect(page.locator('#b-party option')).toHaveCount(settings.max_party_size);
  await snap('defaults');
  const closed = closedDay();
  test.skip(!closed, 'No closed day configured');
  await page.getByTestId('booking-date').fill(closed);
  await expect(page.getByTestId('booking-slots')).toContainText('closed on this day');
});

tc('TC06', async () => {
  S.date1 = openDay(2);
  await pickDateAndParty(S.date1, 2);
  await snap('slots loaded');
  const first = page.locator('#slots .slot').first();
  S.slot1 = await first.getAttribute('data-time');
  await first.click();
  await expect(page.locator('#step-2')).toBeVisible();
  await expect(page.locator('#chosen-summary')).toContainText('2 guests');
});

tc('TC07', async () => {
  const error = page.getByTestId('booking-error');
  await fillGuest({ name: '', phone: '', email: '' });
  await page.getByTestId('booking-submit').click();
  await expect(error).toHaveText('Please enter your name.');
  await snap('name required');

  await fillGuest({ name: 'E2E Website Guest', phone: '', email: 'not-an-email' });
  await page.getByTestId('booking-submit').click();
  await expect(error).toHaveText('Please enter a valid email address.');
  await snap('invalid email');

  await fillGuest({ name: 'E2E Website Guest', phone: '12', email: 'guest@e2e.test' });
  await page.getByTestId('booking-submit').click();
  await expect(error).toHaveText('Please enter a valid phone number.');
  await snap('invalid phone');

  await page.locator('#back-btn').click();
  await expect(page.locator('#step-1')).toBeVisible();
  await page.locator(`#slots .slot[data-time="${S.slot1}"]`).click();
  await expect(page.locator('#step-2')).toBeVisible();
});

tc('TC08', async () => {
  await fillGuest({ name: 'E2E Website Guest', phone: '+65 9123 4567', email: 'guest@e2e.test', requests: 'Window seat please' });
  await snap('details filled');
  await page.getByTestId('booking-submit').click();
  await expect(page.getByTestId('booking-confirmation')).toBeVisible();
  await expect(page.locator('#conf-title')).toHaveText('You’re booked!');
  const ref = page.getByTestId('booking-reference');
  await expect(ref).toHaveText(/^TB-[A-Z0-9]{6}$/);
  S.ref1 = (await ref.textContent()).trim();
});

tc('TC09', async () => {
  await page.locator('#new-booking-btn').click();
  S.date2 = openDay(3, [S.date1]);
  await pickDateAndParty(S.date2, 10);
  await expect(page.locator('#slots .slot[data-time="19:00"]')).toBeVisible();
  await snap('19-00 available for 10');
  await page.locator('#slots .slot[data-time="19:00"]').click();
  await fillGuest({ name: 'E2E Big Party', phone: '+65 9000 1000', email: 'bigparty@e2e.test' });
  await page.getByTestId('booking-submit').click();
  await expect(page.getByTestId('booking-confirmation')).toBeVisible();
  // the hidden confirmation still holds the previous reference until the new one arrives
  await expect(page.getByTestId('booking-reference')).not.toHaveText(S.ref1);
  await expect(page.getByTestId('booking-reference')).toHaveText(/^TB-[A-Z0-9]{6}$/);
  S.ref2 = (await page.getByTestId('booking-reference').textContent()).trim();
  await snap('big party booked');

  await page.locator('#new-booking-btn').click();
  await pickDateAndParty(S.date2, 10);
  for (const t of ['18:00', '19:00', '20:00']) {
    await expect(page.locator(`#slots .slot[data-time="${t}"]`)).toHaveCount(0);
  }
});

tc('TC10', async () => {
  await page.goto('/manage');
  await page.getByTestId('manage-reference').fill(S.ref1);
  await page.getByTestId('manage-email').fill('guest@e2e.test');
  await page.getByTestId('manage-find').click();
  const result = page.getByTestId('manage-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('E2E Website Guest');
  await expect(page.getByTestId('manage-status')).toHaveText('confirmed');
  await expect(result).toContainText('Window seat please');
});

tc('TC11', async () => {
  await page.getByTestId('manage-reference').fill(S.ref1);
  await page.getByTestId('manage-email').fill('someone-else@e2e.test');
  await page.getByTestId('manage-find').click();
  await expect(page.getByTestId('manage-error')).toHaveText('We couldn’t find a booking with those details.');
  await expect(page.getByTestId('manage-result')).toBeHidden();
});

tc('TC12', async () => {
  await page.getByTestId('manage-reference').fill(S.ref2);
  await page.getByTestId('manage-email').fill('bigparty@e2e.test');
  await page.getByTestId('manage-find').click();
  await expect(page.getByTestId('manage-result')).toBeVisible();
  await expect(page.getByTestId('manage-result')).toContainText('E2E Big Party');
  await expect(page.getByTestId('manage-status')).toHaveText('confirmed');
  await snap('before cancel');
  await page.getByTestId('manage-cancel').click();
  await expect(page.getByTestId('manage-status')).toHaveText('cancelled');
  await expect(page.getByTestId('manage-cancel')).toHaveCount(0);
  await snap('cancelled');

  await page.goto('/');
  await pickDateAndParty(S.date2, 10);
  await expect(page.locator('#slots .slot[data-time="19:00"]')).toBeVisible();
});

tc('TC13', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.nav-links a[href="#menu"]')).toBeHidden();
  await expect(page.locator('.nav-links a.btn')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('#book').scrollIntoViewIfNeeded();
  await snap('mobile booking form');
  await page.setViewportSize(DESKTOP);
});

tc('TC14', async () => {
  const bookings = await anonRest('bookings?select=id');
  const customers = await anonRest('customers?select=id');
  const insert = await anonRest('restaurant_tables', { method: 'POST', body: JSON.stringify({ name: 'E2E-hack', capacity: 2 }) });
  const update = await anonRest('site_settings?id=eq.1', {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ tagline: 'hacked' }),
  });
  const publicSettings = await anonRest('site_settings?select=restaurant_name');
  const menu = await anonRest('menu_items?select=id');

  const rows = [
    ['Read bookings as anonymous', `${bookings.body?.length ?? 'n/a'} rows`, bookings.body?.length === 0],
    ['Read customers as anonymous', `${customers.body?.length ?? 'n/a'} rows`, customers.body?.length === 0],
    ['Insert into restaurant_tables', `HTTP ${insert.status}`, insert.status === 401 || insert.status === 403],
    ['Update site_settings', `HTTP ${update.status}, ${update.body?.length ?? 0} rows changed`, !update.body?.length],
    ['Read site_settings (public)', `${publicSettings.body?.length} rows`, publicSettings.body?.length === 1],
    ['Read menu_items (public)', `${menu.body?.length} rows`, menu.body?.length > 0],
  ];
  // Render the API results so they appear in the screenshot and recording.
  await page.setContent(`<html><body style="font:15px system-ui;padding:32px">
    <h2>TC14 – Anonymous access checks (Supabase REST, anon key)</h2>
    <table border="1" cellpadding="8" style="border-collapse:collapse">
      <tr><th>Check</th><th>Result</th><th>Verdict</th></tr>
      ${rows.map(([c, r, ok]) => `<tr><td>${c}</td><td>${r}</td><td style="color:${ok ? 'green' : 'red'}">${ok ? 'PASS' : 'FAIL'}</td></tr>`).join('')}
    </table></body></html>`);

  expect(bookings.body).toEqual([]);
  expect(customers.body).toEqual([]);
  expect([401, 403]).toContain(insert.status);
  expect(update.body ?? []).toEqual([]);
  expect(publicSettings.body).toHaveLength(1);
  expect(menu.body.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
tc('TC15', async () => {
  await page.goto('/crm');
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('#auth-title')).toHaveText('Staff sign in');
  await page.getByTestId('auth-email').fill(ADMIN_EMAIL);
  await page.getByTestId('auth-password').fill('definitely-wrong-password');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-message')).toContainText(/invalid login credentials/i);
  await expect(page.locator('#app')).toBeHidden();
});

tc('TC16', async () => {
  await page.locator('#toggle-auth').click();
  await expect(page.locator('#auth-title')).toHaveText('Create staff account');
  await expect(page.getByTestId('auth-name')).toBeVisible();
  await page.getByTestId('auth-name').fill('E2E New Staff');
  await page.getByTestId('auth-email').fill('newstaff@e2e.test');
  await page.getByTestId('auth-password').fill('abc');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-message')).toHaveText('Enter your email and a password of at least 6 characters.');
  await snap('short password rejected');
  await page.locator('#toggle-auth').click();
  await expect(page.locator('#auth-title')).toHaveText('Staff sign in');
});

tc('TC17', async () => {
  await page.getByTestId('auth-email').fill(ADMIN_EMAIL);
  await page.getByTestId('auth-password').fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#page-title')).toHaveText('Dashboard');
  await expect(page.locator('.stats .stat')).toHaveCount(4);
  await expect(page.locator('#me-name')).toHaveText('E2E Test Admin');
  await expect(page.locator('#me-role')).toHaveText('admin');
  await expect(page.locator('.side-nav a[data-route="staff"]')).toBeVisible();
});

tc('TC18', async () => {
  await page.getByTestId('new-booking').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.getByTestId('nb-name').fill('E2E Phone Guest');
  await page.getByTestId('nb-phone').fill('+65 8000 1111');
  await page.getByTestId('nb-email').fill('phone@e2e.test');
  await page.getByTestId('nb-time').fill('21:00');
  await page.getByTestId('nb-party').fill('4');
  await snap('new booking form');
  await page.getByTestId('modal-submit').click();
  await toast(/Booking TB-[A-Z0-9]{6} created/);
  const item = page.locator('.timeline-item', { hasText: 'E2E Phone Guest' });
  await expect(item).toBeVisible();
  await expect(item).toContainText('4 guests');
  await expect(item).not.toContainText('No table');
});

tc('TC19', async () => {
  await page.locator('.side-nav a[data-route="bookings"]').click();
  await expect(page.locator('#page-title')).toHaveText('Bookings');
  await page.locator('[data-preset="week"]').click();
  await page.getByTestId('filter-search').fill(S.ref1);
  const rows = page.locator('[data-testid="bookings-table"] tbody tr.clickable');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('E2E Website Guest');
  await expect(rows.first()).toContainText('Website');
  await snap('search by reference');
  await page.getByTestId('filter-status').selectOption('cancelled');
  await expect(page.locator('#view .empty')).toContainText('No bookings match');
  await page.getByTestId('filter-status').selectOption('all');
  await expect(rows).toHaveCount(1);
});

tc('TC20', async () => {
  const row = page.locator('[data-testid="bookings-table"] tbody tr.clickable', { hasText: 'E2E Website Guest' });
  await row.locator('[data-status-for]').selectOption('seated');
  await toast('Booking marked seated');
  await expect(row.locator('[data-status-for]')).toHaveValue('seated');
});

tc('TC21', async () => {
  const row = page.locator('[data-testid="bookings-table"] tbody tr.clickable', { hasText: 'E2E Website Guest' });
  await row.locator('td').first().click();
  const modal = page.locator('#modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('E2E Website Guest');
  await expect(modal).toContainText('Website');
  await modal.locator('input[name="party_size"]').fill('3');
  await modal.locator('textarea[name="internal_notes"]').fill('E2E note: birthday cake');
  await snap('edit dialog');
  await page.getByTestId('modal-submit').click();
  await toast('Booking updated');
  await expect(row.locator('td').nth(2)).toHaveText('3');
  await expect(row.locator('.note-ico')).toBeVisible();
});

tc('TC22', async () => {
  await page.locator('.side-nav a[data-route="customers"]').click();
  await page.getByTestId('customer-search').fill('e2e.test');
  const row = page.locator('[data-testid="customers-table"] tbody tr', { hasText: 'E2E Website Guest' });
  await expect(row).toBeVisible();
  await expect(row.locator('td').nth(3)).toHaveText('1');
  await row.click();
  const modal = page.locator('#modal');
  await expect(modal.locator('.section-title')).toHaveText('Booking history');
  await expect(modal.locator('table.data tbody tr')).toHaveCount(1);
  await modal.locator('input[name="tags"]').fill('regular, window-seat');
  await modal.locator('input[name="is_vip"]').check();
  await snap('customer profile');
  await page.getByTestId('modal-submit').click();
  await toast('Customer saved');
  await expect(row.locator('.badge.vip')).toBeVisible();
  await expect(row).toContainText('regular');
  await expect(row).toContainText('window-seat');
});

tc('TC23', async () => {
  await page.locator('.side-nav a[data-route="bookings"]').click();
  await page.getByTestId('new-booking').click();
  await page.getByTestId('nb-name').fill('E2E <b>Bold</b> Guest');
  await page.getByTestId('nb-phone').fill('+65 8000 2222');
  await page.getByTestId('nb-email').fill('bold@e2e.test');
  await page.getByTestId('nb-time').fill('20:00');
  await page.getByTestId('modal-submit').click();
  await toast(/created/);
  await page.locator('.side-nav a[data-route="customers"]').click();
  await page.getByTestId('customer-search').fill('Bold');
  const row = page.locator('[data-testid="customers-table"] tbody tr').first();
  await expect(row).toContainText('E2E <b>Bold</b> Guest');
  await expect(page.locator('#view b')).toHaveCount(0);
});

tc('TC24', async () => {
  await page.locator('.side-nav a[data-route="tables"]').click();
  await page.getByTestId('add-table').click();
  const modal = page.locator('#modal');
  await modal.locator('input[name="name"]').fill('E2E-T99');
  await modal.locator('input[name="capacity"]').fill('4');
  await modal.locator('input[name="area"]').fill('Test');
  await page.getByTestId('modal-submit').click();
  await toast('Table saved');
  const row = page.locator('[data-testid="tables-table"] tbody tr', { hasText: 'E2E-T99' });
  await expect(row).toBeVisible();
  await snap('table added');
  await row.click();
  await page.locator('#modal-delete').click();
  await toast('Table deleted');
  await expect(row).toHaveCount(0);
});

tc('TC25', async () => {
  await page.locator('.side-nav a[data-route="menu"]').click();
  await page.getByTestId('add-menu-item').click();
  const modal = page.locator('#modal');
  await modal.locator('input[name="name"]').fill('E2E Test Dish');
  await modal.locator('input[name="category"]').fill('Desserts');
  await modal.locator('input[name="price"]').fill('9.50');
  await modal.locator('input[name="is_featured"]').check();
  await page.getByTestId('modal-submit').click();
  await toast('Menu updated');
  await expect(page.locator('[data-item-id]', { hasText: 'E2E Test Dish' })).toBeVisible();

  await page.goto('/');
  await page.locator('#menu').scrollIntoViewIfNeeded();
  await expect(page.locator('#menu-grid')).toContainText('E2E Test Dish');
  await expect(page.locator('#menu-grid')).toContainText('9.50');
  await snap('dish on website');

  await crm('menu');
  await page.locator('[data-item-id]', { hasText: 'E2E Test Dish' }).click();
  await page.locator('#modal-delete').click();
  await toast('Dish deleted');
  await expect(page.locator('[data-item-id]', { hasText: 'E2E Test Dish' })).toHaveCount(0);
});

tc('TC26', async () => {
  await crm('website');
  const tagline = page.locator('input[name="tagline"]');
  S.originalTagline = await tagline.inputValue();
  await tagline.fill('E2E tagline check');
  await saveSettings();

  await page.goto('/');
  await expect(page.locator('.hero [data-bind="tagline"]')).toHaveText('E2E tagline check');
  await snap('new tagline on website');

  await crm('website');
  await page.locator('input[name="tagline"]').fill(S.originalTagline);
  await saveSettings();
});

tc('TC27', async () => {
  await crm('website');
  await page.locator('input[name="booking_enabled"]').uncheck();
  await saveSettings();
  await page.goto('/');
  await page.locator('#book').scrollIntoViewIfNeeded();
  await expect(page.locator('#booking-disabled')).toBeVisible();
  await expect(page.locator('#booking-disabled')).toContainText('Online booking is paused');
  await expect(page.locator('#booking-form')).toBeHidden();
  await snap('booking paused');

  await crm('website');
  await page.locator('input[name="booking_enabled"]').check();
  await saveSettings();
});

tc('TC28', async () => {
  await crm('website');
  await page.locator('input[name="auto_confirm"]').uncheck();
  await saveSettings();

  await page.goto('/');
  await pickDateAndParty(openDay(2), 2);
  await page.locator('#slots .slot').last().click();
  await fillGuest({ name: 'E2E Pending Guest', phone: '+65 9333 4444', email: 'pending@e2e.test' });
  await page.getByTestId('booking-submit').click();
  await expect(page.getByTestId('booking-confirmation')).toBeVisible();
  await expect(page.locator('#conf-title')).toHaveText('Request received!');
  await snap('request received');

  await crm('dashboard');
  const item = page.locator('.timeline-item', { hasText: 'E2E Pending Guest' });
  await expect(item).toBeVisible();
  await expect(page.locator('#pending-pill')).toBeVisible();
  await expect(page.locator('#pending-pill')).toHaveText(/^[1-9]\d*$/);
  await snap('awaiting confirmation');
  await item.locator('[data-confirm]').click();
  await toast('Booking confirmed');
  await expect(item).toHaveCount(0);

  await crm('website');
  await page.locator('input[name="auto_confirm"]').check();
  await saveSettings();
});

tc('TC29', async () => {
  await page.locator('.side-nav a[data-route="staff"]').click();
  await expect(page.locator('#view')).toContainText('E2E Test Admin');
  await expect(page.locator('#view')).toContainText('(you)');
  await page.locator('#invite').click();
  await page.locator('#modal input[name="email"]').fill('invitee@e2e.test');
  await page.getByTestId('modal-submit').click();
  await toast('Invite added for invitee@e2e.test');
  await expect(page.locator('[data-revoke="invitee@e2e.test"]')).toBeVisible();
  await snap('invite pending');
  await page.locator('[data-revoke="invitee@e2e.test"]').click();
  await expect(page.locator('[data-revoke="invitee@e2e.test"]')).toHaveCount(0);
});

tc('TC30', async () => {
  await page.getByTestId('signout').click();
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await page.reload();
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});
