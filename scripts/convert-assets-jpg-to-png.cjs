/**
 * Convierte icon/splash/adaptive de JPG → PNG válido (Exige PNG en app.json).
 * Uso: node scripts/convert-assets-jpg-to-png.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.join(__dirname, '..', 'assets');
const files = ['icon.jpg', 'adaptive-icon.jpg', 'splash.jpg'];

(async () => {
  for (const name of files) {
    const src = path.join(assetsDir, name);
    if (!fs.existsSync(src)) {
      console.warn('Omitido (no existe):', name);
      continue;
    }
    const dst = path.join(assetsDir, name.replace(/\.jpg$/i, '.png'));
    await sharp(src).png({ compressionLevel: 9 }).toFile(dst);
    console.log('OK', path.basename(dst));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
