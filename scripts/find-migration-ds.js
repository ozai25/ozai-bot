/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, 'dist');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && e.name === 'migration-data-source.js') {
      console.log(full);
      process.exit(0);
    }
  }
}

if (!fs.existsSync(distRoot)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

try {
  walk(distRoot);
  console.error('migration-data-source.js not found in dist/. Check tsconfig.build.json includes it.');
  process.exit(2);
} catch (err) {
  console.error(err);
  process.exit(3);
}
