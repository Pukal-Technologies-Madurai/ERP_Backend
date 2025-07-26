// Backend/import.js
const fs = require('fs-extra');
const path = require('path');

const src = path.join(__dirname, '../ERP_Frontend/build');
const dest = path.join(__dirname, 'frontend');

(async () => {
  try {
    await fs.remove(dest);
    await fs.copy(src, dest);
    console.log('✅ Imported build from Frontend/build');
  } catch (err) {
    console.error('❌ Failed to import:', err);
  }
})();
