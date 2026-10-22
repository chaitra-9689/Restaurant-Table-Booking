// Builds the deliverables from the last Playwright run:
//   TEST_CASES.md, Test_Report.xlsx, testing_recording/<run>.mp4
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ExcelJS = require('exceljs');
const ffmpeg = require('ffmpeg-static');
const cases = require('../tests/test-cases');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'test-results', 'results.json');
const SS_DIR = path.join(ROOT, 'testing_ss');
const REC_DIR = path.join(ROOT, 'testing_recording');
const VIDEO_STATE = path.join(ROOT, 'tests', '.state', 'video.json');

const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');

function collectSpecs(suite, out = []) {
  for (const spec of suite.specs || []) out.push(spec);
  for (const child of suite.suites || []) collectSpecs(child, out);
  return out;
}

function loadResults() {
  if (!fs.existsSync(RESULTS)) throw new Error('No test-results/results.json – run the tests first.');
  const json = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  const byId = {};
  for (const spec of json.suites.flatMap((s) => collectSpecs(s))) {
    const id = spec.title.split(' ')[0];
    const result = spec.tests[0]?.results?.at(-1);
    const raw = result?.status || spec.tests[0]?.status || 'skipped';
    const status = raw === 'passed' ? 'PASS' : raw === 'skipped' ? 'NOT RUN' : 'FAIL';
    const error = stripAnsi(result?.error?.message || '').split('\n').filter(Boolean).slice(0, 6).join('\n');
    byId[id] = { status, duration: (result?.duration || 0) / 1000, error };
  }
  return { byId, stats: json.stats, config: json.config };
}

function screenshotsFor(id) {
  if (!fs.existsSync(SS_DIR)) return [];
  return fs.readdirSync(SS_DIR).filter((f) => f.startsWith(`${id}_`)).sort((a, b) => {
    // step screenshots first (in order), final PASS/FAIL screenshot last
    const step = (f) => (/_step(\d+)_/.exec(f) ? Number(/_step(\d+)_/.exec(f)[1]) : 999);
    return step(a) - step(b);
  });
}

function convertVideo(stamp) {
  if (!fs.existsSync(VIDEO_STATE)) return null;
  const { path: webm } = JSON.parse(fs.readFileSync(VIDEO_STATE, 'utf8'));
  if (!fs.existsSync(webm)) return null;
  const mp4 = path.join(REC_DIR, `E2E_Test_Run_${stamp}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  fs.rmSync(path.join(REC_DIR, 'raw'), { recursive: true, force: true });
  fs.rmSync(VIDEO_STATE);
  return mp4;
}

function rows(results) {
  return cases.map((c) => {
    const r = results.byId[c.id] || { status: 'NOT RUN', duration: 0, error: '' };
    const actual = r.status === 'PASS' ? `As expected. ${c.expected}`
      : r.status === 'FAIL' ? `Failed: ${r.error || 'see report'}`
      : 'Not executed (an earlier test in the serial run failed or it was skipped).';
    return { ...c, ...r, actual, shots: screenshotsFor(c.id) };
  });
}

async function writeExcel(data, meta, file) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Automated E2E suite (Playwright)';
  wb.created = new Date();

  // Summary sheet
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 28 }, { width: 70 }];
  sum.addRow(['Restaurant Table Booking – E2E Test Report']).font = { bold: true, size: 16 };
  sum.addRow([]);
  const info = [
    ['Run date', meta.runDate],
    ['Target URL', meta.baseURL],
    ['Backend', 'Supabase (project from .env)'],
    ['Browser', 'Chromium (Playwright 1.57, headless, 1280×800)'],
    ['Total test cases', data.length],
    ['Passed', data.filter((d) => d.status === 'PASS').length],
    ['Failed', data.filter((d) => d.status === 'FAIL').length],
    ['Not run', data.filter((d) => d.status === 'NOT RUN').length],
    ['Pass rate', `${Math.round((data.filter((d) => d.status === 'PASS').length / data.length) * 100)}%`],
    ['Total duration', `${meta.duration.toFixed(1)} s`],
    ['Screenshots', 'testing_ss/'],
    ['Screen recording', meta.video ? path.relative(ROOT, meta.video).replace(/\\/g, '/') : 'not available'],
  ];
  for (const [k, v] of info) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  }

  // Test case sheet
  const ws = wb.addWorksheet('Test Cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'ID', key: 'id', width: 7 },
    { header: 'Module', key: 'module', width: 22 },
    { header: 'Test case', key: 'title', width: 34 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Preconditions', key: 'preconditions', width: 28 },
    { header: 'Test steps (step by step)', key: 'steps', width: 70 },
    { header: 'Expected result', key: 'expected', width: 40 },
    { header: 'Actual result', key: 'actual', width: 45 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Duration (s)', key: 'duration', width: 11 },
    { header: 'Screenshots (testing_ss/)', key: 'shots', width: 50 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1A17' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 28;

  for (const d of data) {
    const row = ws.addRow({
      ...d,
      steps: d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      duration: Number(d.duration.toFixed(1)),
      shots: d.shots.join('\n'),
    });
    row.alignment = { vertical: 'top', wrapText: true };
    const status = row.getCell('status');
    status.font = { bold: true, color: { argb: d.status === 'PASS' ? 'FF1F7A46' : d.status === 'FAIL' ? 'FFB3261E' : 'FF8A5A00' } };
    status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: d.status === 'PASS' ? 'FFE2F4E9' : d.status === 'FAIL' ? 'FFFDE9E7' : 'FFFFF2D1' } };
    status.alignment = { vertical: 'top', horizontal: 'center' };
  }
  ws.autoFilter = { from: 'A1', to: 'K1' };
  await wb.xlsx.writeFile(file);
}

function writeMarkdown(data, meta, file) {
  const pass = data.filter((d) => d.status === 'PASS').length;
  const icon = (s) => (s === 'PASS' ? '✅ PASS' : s === 'FAIL' ? '❌ FAIL' : '⏭️ NOT RUN');
  const lines = [
    '# Restaurant Table Booking – Test Cases & Results',
    '',
    `**Run date:** ${meta.runDate}  `,
    `**Target:** ${meta.baseURL}  `,
    '**Backend:** Supabase (credentials from `.env`)  ',
    '**Tool:** Playwright 1.57 (Chromium, headless, 1280×800, one continuous session)  ',
    `**Result:** ${pass}/${data.length} passed (${Math.round((pass / data.length) * 100)}%) in ${meta.duration.toFixed(1)} s  `,
    `**Recording:** ${meta.video ? '`' + path.relative(ROOT, meta.video).replace(/\\/g, '/') + '`' : 'n/a'} · **Screenshots:** \`testing_ss/\` · **Excel:** \`Test_Report.xlsx\``,
    '',
    '## How the suite works',
    '',
    '1. **Global setup** (`tests/support/global-setup.js`) clears old screenshots/recordings, removes leftovers from any',
    '   previous run, snapshots the site settings it will touch, and creates a temporary confirmed CRM admin',
    '   (`e2e-admin@e2e.test`, password stored in `.env`) directly in Supabase.',
    '2. **Tests** (`tests/e2e.spec.js`) run serially in one browser session so the whole run is one video. Later tests',
    '   reuse data from earlier ones (e.g. the booking reference from TC08 is looked up in TC10 and edited in TC21).',
    '   A screenshot is taken at key steps and after every test (`<ID>_PASS|FAIL_<name>.png`).',
    '3. **Global teardown** restores the settings snapshot and deletes everything tagged as test data',
    '   (emails `@e2e.test`, names starting `E2E`), including the temporary admin.',
    '4. **Report** (`scripts/test-report.js`) builds this file, the Excel workbook and converts the recording to MP4.',
    '',
    'Run it again with `npm run test:e2e` (set `E2E_BASE_URL=http://localhost:3000` to test locally).',
    '',
    '## Summary',
    '',
    '| ID | Module | Test case | Priority | Status |',
    '|----|--------|-----------|----------|--------|',
    ...data.map((d) => `| ${d.id} | ${d.module} | ${d.title} | ${d.priority} | ${icon(d.status)} |`),
    '',
    '## Test cases in detail',
    '',
  ];
  for (const d of data) {
    lines.push(
      `### ${d.id} – ${d.title}`,
      '',
      `**Module:** ${d.module} · **Priority:** ${d.priority} · **Status:** ${icon(d.status)} · **Duration:** ${d.duration.toFixed(1)} s`,
      '',
      `**Preconditions:** ${d.preconditions}`,
      '',
      '**Steps:**',
      '',
      ...d.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      `**Expected result:** ${d.expected}`,
      '',
      `**Actual result:** ${d.status === 'FAIL' ? '\n\n```\n' + d.actual + '\n```' : d.actual}`,
      '',
      d.shots.length ? `**Screenshots:** ${d.shots.map((s) => `[${s}](testing_ss/${encodeURI(s)})`).join(', ')}` : '',
      '',
    );
  }
  fs.writeFileSync(file, lines.join('\n'));
}

(async () => {
  const results = loadResults();
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1_');
  const video = convertVideo(stamp);
  const data = rows(results);
  const meta = {
    runDate: now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    baseURL: results.config?.projects?.[0]?.use?.baseURL || process.env.E2E_BASE_URL || 'https://restaurant-table-booking-coral.vercel.app',
    duration: (results.stats?.duration || 0) / 1000,
    video,
  };
  await writeExcel(data, meta, path.join(ROOT, 'Test_Report.xlsx'));
  writeMarkdown(data, meta, path.join(ROOT, 'TEST_CASES.md'));
  const pass = data.filter((d) => d.status === 'PASS').length;
  console.log(`Report: ${pass}/${data.length} passed`);
  console.log(`  TEST_CASES.md, Test_Report.xlsx${video ? `, ${path.relative(ROOT, video)}` : ''}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
