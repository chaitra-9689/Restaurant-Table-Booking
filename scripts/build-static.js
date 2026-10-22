// Builds a static copy of the site into dist/ for hosting (e.g. Vercel).
// Only browser-safe values (Supabase URL + anon key) are written out.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const supabaseVersion = require('@supabase/supabase-js/package.json').version;

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });

fs.writeFileSync(path.join(dist, 'config.js'), `window.APP_CONFIG = ${JSON.stringify({
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
})};\n`);

// Root vercel.json is the single source of routing config (Git deploys read it from the repo root);
// copy it so `cd dist && vercel --prod` behaves the same. Build settings only apply at the root.
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const cdn = vercelConfig.routes.find((r) => r.src && r.src.startsWith('/vendor/supabase'));
if (!cdn || !cdn.dest.includes(`@supabase/supabase-js@${supabaseVersion}/`)) {
  console.error(`vercel.json pins a different supabase-js than the installed ${supabaseVersion}; update the /vendor/supabase.js route`);
  process.exit(1);
}
for (const key of ['$schema', 'framework', 'installCommand', 'buildCommand', 'outputDirectory']) delete vercelConfig[key];
fs.writeFileSync(path.join(dist, 'vercel.json'), JSON.stringify(vercelConfig, null, 2) + '\n');

console.log(`Built dist/ (supabase-js ${supabaseVersion})`);
