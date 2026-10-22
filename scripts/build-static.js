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

fs.writeFileSync(path.join(dist, 'vercel.json'), JSON.stringify({
  cleanUrls: true,
  rewrites: [
    { source: '/crm', destination: '/crm/index.html' },
    { source: '/vendor/supabase.js', destination: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${supabaseVersion}/dist/umd/supabase.js` },
  ],
  headers: [
    { source: '/config.js', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
}, null, 2) + '\n');

console.log(`Built dist/ (supabase-js ${supabaseVersion})`);
