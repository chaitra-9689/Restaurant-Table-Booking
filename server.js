require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');

const { SUPABASE_URL, SUPABASE_ANON_KEY, PORT = 3000 } = process.env;

const app = express();

// Public, browser-safe config only. Never expose the access token or service key here.
app.get('/config.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store');
  res.send(`window.APP_CONFIG = ${JSON.stringify({
    supabaseUrl: SUPABASE_URL || '',
    supabaseAnonKey: SUPABASE_ANON_KEY || '',
  })};`);
});

app.use('/vendor/supabase.js', (req, res) =>
  res.sendFile(require.resolve('@supabase/supabase-js/dist/umd/supabase.js')));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/crm', (req, res) => res.sendFile(path.join(__dirname, 'public', 'crm', 'index.html')));

app.listen(PORT, () => {
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`CRM:     http://localhost:${PORT}/crm`);
  if (!SUPABASE_ANON_KEY) console.warn('Warning: SUPABASE_ANON_KEY is empty in .env – pages will show a setup notice.');
});
