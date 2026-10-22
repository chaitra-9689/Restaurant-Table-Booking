// Runs the Playwright suite, then always builds the report (even if tests fail).
const { spawnSync } = require('child_process');

const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit' });

const tests = run([require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)]);
const report = run([require.resolve('./test-report.js')]);
process.exit(tests.status || report.status || 0);
