const { cleanupTestData, restoreSettings } = require('./db');

module.exports = async () => {
  await restoreSettings();
  await cleanupTestData();
};
