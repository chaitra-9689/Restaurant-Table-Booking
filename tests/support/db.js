// Test-only helpers that talk to Supabase with the credentials in .env.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

const ROOT = path.join(__dirname, '..', '..');
const STATE_DIR = path.join(__dirname, '..', '.state');
const ENV_PATH = path.join(ROOT, '.env');

// Everything the suite creates is tagged with this domain / prefix so teardown can find it.
const TEST_DOMAIN = 'e2e.test';
const ADMIN_EMAIL = `e2e-admin@${TEST_DOMAIN}`;

/** Runs SQL through the Supabase Management API (admin, server-side only). */
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${body}`);
  return JSON.parse(body);
}

/** Calls the public REST API with the anon key, exactly like an anonymous visitor. */
async function anonRest(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...init.headers },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Returns the test admin password, generating and saving one to .env on first use. */
function adminPassword() {
  if (process.env.E2E_ADMIN_PASSWORD) return process.env.E2E_ADMIN_PASSWORD;
  const pw = 'E2e-' + crypto.randomBytes(12).toString('base64url');
  fs.appendFileSync(ENV_PATH, `\n# Temporary CRM admin used only by the automated test suite\nE2E_ADMIN_EMAIL=${ADMIN_EMAIL}\nE2E_ADMIN_PASSWORD=${pw}\n`);
  process.env.E2E_ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.E2E_ADMIN_PASSWORD = pw;
  return pw;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function createTestAdmin() {
  const pw = adminPassword();
  await sql(`
    delete from auth.users where email = ${q(ADMIN_EMAIL)};
    with u as (
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${q(ADMIN_EMAIL)}, extensions.crypt(${q(pw)}, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{"full_name":"E2E Test Admin"}', now(), now(),
        '', '', '', '', '', '', '', '')
      returning id, email
    )
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select id::text, id, json_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
    from u;
    insert into staff (user_id, email, full_name, role)
    select id, email, 'E2E Test Admin', 'admin' from auth.users where email = ${q(ADMIN_EMAIL)}
    on conflict (user_id) do update set role = 'admin', full_name = 'E2E Test Admin';
  `);
  return { email: ADMIN_EMAIL, password: pw };
}

async function cleanupTestData() {
  await sql(`
    delete from bookings where customer_id in (
      select id from customers where email like '%@${TEST_DOMAIN}' or full_name like 'E2E %');
    delete from customers where email like '%@${TEST_DOMAIN}' or full_name like 'E2E %';
    delete from menu_items where name like 'E2E %';
    delete from restaurant_tables where name like 'E2E-%';
    delete from staff_invites where email like '%@${TEST_DOMAIN}';
    delete from auth.users where email like '%@${TEST_DOMAIN}';
  `);
}

const SETTINGS_SNAPSHOT = path.join(STATE_DIR, 'settings.json');
const RESTORED_FIELDS = ['tagline', 'booking_enabled', 'auto_confirm'];

async function snapshotSettings() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // Keep the first snapshot if a previous run crashed before restoring.
  if (fs.existsSync(SETTINGS_SNAPSHOT)) return;
  const [s] = await sql(`select ${RESTORED_FIELDS.join(', ')} from site_settings where id = 1`);
  fs.writeFileSync(SETTINGS_SNAPSHOT, JSON.stringify(s, null, 2));
}

async function restoreSettings() {
  if (!fs.existsSync(SETTINGS_SNAPSHOT)) return;
  const s = JSON.parse(fs.readFileSync(SETTINGS_SNAPSHOT, 'utf8'));
  await sql(`update site_settings set tagline = ${q(s.tagline)}, booking_enabled = ${!!s.booking_enabled},
             auto_confirm = ${!!s.auto_confirm} where id = 1`);
  fs.rmSync(SETTINGS_SNAPSHOT);
}

module.exports = {
  sql, anonRest, createTestAdmin, cleanupTestData, snapshotSettings, restoreSettings,
  TEST_DOMAIN, ADMIN_EMAIL, STATE_DIR, ROOT,
};
