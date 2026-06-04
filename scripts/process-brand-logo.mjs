/**
 * Removes near-white background and writes transparent PNG + favicon sizes.
 * Run: node scripts/process-brand-logo.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'node_modules', 'sharp'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const srcCandidates = [
  path.join(root, 'assets', 'brand-source', 'logo-source.png'),
  path.join(
    root,
    'assets',
    'c__Users_STR_AppData_Roaming_Cursor_User_workspaceStorage_5334511a06c5bcdcefed99208bc4a2b2_images_A_modern_and_minimalist_logo_202606042221-e873581f-0217-43bd-8c71-06e28bce8e87.png'
  ),
];

const src = srcCandidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('Source logo image not found');
  process.exit(1);
}

const brandDir = path.join(root, 'assets', 'brand');
fs.mkdirSync(brandDir, { recursive: true });

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r > 235 && g > 235 && b > 235) {
    data[i + 3] = 0;
  } else if (r > 210 && g > 210 && b > 210) {
    const lum = Math.min(r, g, b);
    data[i + 3] = Math.min(data[i + 3], Math.max(0, 255 - (lum - 200) * 10));
  }
}

const logoPng = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toBuffer();

const targets = [
  ['logo.png', null],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
];

for (const [name, size] of targets) {
  let pipeline = sharp(logoPng);
  if (size) {
    pipeline = pipeline.resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  const out = path.join(brandDir, name);
  await pipeline.png().toFile(out);
  console.log('wrote', out);
}

const deployDirs = [
  'website/public',
  'admin-panel/public',
  'customer-app/assets',
  'rider-app/assets',
];

for (const dir of deployDirs) {
  const full = path.join(root, dir);
  fs.mkdirSync(full, { recursive: true });
  for (const [name] of targets) {
    fs.copyFileSync(path.join(brandDir, name), path.join(full, name === 'logo.png' ? 'logo.png' : name));
  }
  // favicon.ico substitute: use 32px as favicon.png for web
  fs.copyFileSync(path.join(brandDir, 'favicon-32.png'), path.join(full, 'favicon.png'));
  if (dir.includes('customer-app') || dir.includes('rider-app')) {
    fs.copyFileSync(path.join(brandDir, 'icon-192.png'), path.join(full, 'icon.png'));
    fs.copyFileSync(path.join(brandDir, 'icon-192.png'), path.join(full, 'adaptive-icon.png'));
  }
}

console.log('Done.');
