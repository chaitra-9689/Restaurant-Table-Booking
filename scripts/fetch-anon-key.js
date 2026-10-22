// Fetches the project's public anon/publishable key via the Management API
// and writes it into .env as SUPABASE_ANON_KEY. The key is not printed.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF } = process.env;
const envPath = path.join(__dirname, '..', '.env');

(async () => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const keys = await res.json();

  const key = keys.find((k) => k.name === 'anon' && k.api_key)
    || keys.find((k) => k.type === 'publishable' && k.api_key);
  if (!key) throw new Error('No anon/publishable key found for this project');

  const env = fs.readFileSync(envPath, 'utf8');
  const line = `SUPABASE_ANON_KEY=${key.api_key}`;
  const next = /^SUPABASE_ANON_KEY=.*$/m.test(env)
    ? env.replace(/^SUPABASE_ANON_KEY=.*$/m, line)
    : `${env.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, next);
  console.log(`SUPABASE_ANON_KEY set in .env (${key.name || key.type} key). Restart the server.`);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
