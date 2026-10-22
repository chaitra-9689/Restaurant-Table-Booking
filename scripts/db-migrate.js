// Applies supabase/migrations/*.sql in order via the Supabase Management API.
// Migrations are written to be idempotent, so re-running is safe.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF } = process.env;
const dir = path.join(__dirname, '..', 'supabase', 'migrations');

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return JSON.parse(body);
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    process.stdout.write(`Applying ${file} ... `);
    await runSql(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log('ok');
  }
})().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
