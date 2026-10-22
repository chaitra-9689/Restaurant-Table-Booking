const fs = require('fs');
const path = require('path');
const { cleanupTestData, createTestAdmin, snapshotSettings, ROOT } = require('./db');

module.exports = async () => {
  // Fresh output folders for this run
  for (const dir of ['testing_ss', 'testing_recording', path.join('testing_recording', 'raw')]) {
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
    fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  }
  await cleanupTestData(); // leftovers from an interrupted run
  await snapshotSettings();
  await createTestAdmin();
};
