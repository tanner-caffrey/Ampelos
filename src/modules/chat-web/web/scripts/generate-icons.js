#!/usr/bin/env node
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../public/favicon.svg');
const iconsDir = join(__dirname, '../public/icons');

const sizes = [192, 512];

async function generateIcons() {
  const svg = readFileSync(svgPath);

  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, `icon-${size}.png`));

    console.log(`Generated icon-${size}.png`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
