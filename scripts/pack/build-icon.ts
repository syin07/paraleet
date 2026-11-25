// Builds the app icon from Para's own sprite (PRD section 6: the bird is drawn by code, so its
// icon is too). Writes build/icon.icns for the packager. Run by `npm run dist`; macOS only,
// because it uses the system's `iconutil`.
//
//   npx tsx scripts/pack/build-icon.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { renderSprite, SPRITE_SIZE } from '../../src/core/sprite';

/** The seed the sidebar logo and the empty states use, so the icon is the same bird. */
const ICON_SEED = 20261125;
const BACKGROUND = [0x26, 0x26, 0x26] as const;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, check]);
}

/** A PNG from RGBA bytes, row by row. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Each row starts with its filter type: 0, none.
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The icon at `size` pixels: a dark rounded square in the shape macOS icons have, with Para on
 * it, scaled by a whole number so every sprite pixel stays a crisp square.
 */
export function renderIcon(size: number): Uint8Array {
  const sprite = renderSprite(ICON_SEED, 'adult', 'content', 0, []);
  const out = new Uint8Array(size * size * 4);
  // macOS icons leave a margin around a rounded square.
  const inset = Math.round(size * 0.098);
  const side = size - 2 * inset;
  const radius = side * 0.225;
  const insideSquare = (x: number, y: number): boolean => {
    const px = x + 0.5 - inset;
    const py = y + 0.5 - inset;
    if (px < 0 || py < 0 || px > side || py > side) return false;
    const cx = Math.min(Math.max(px, radius), side - radius);
    const cy = Math.min(Math.max(py, radius), side - radius);
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
  };
  // The bird fills about three quarters of the square. Below 64 pixels there is no room for a
  // whole-number scale, so the smallest icons sample the sprite directly.
  const scale = Math.max(Math.floor((side * 0.78) / SPRITE_SIZE), 0);
  const drawn = scale > 0 ? SPRITE_SIZE * scale : Math.round(side * 0.8);
  const left = Math.round((size - drawn) / 2);
  const top = Math.round((size - drawn) / 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const to = (y * size + x) * 4;
      if (!insideSquare(x, y)) continue;
      let color: readonly number[] = BACKGROUND;
      const sx = Math.floor(((x - left) * SPRITE_SIZE) / drawn);
      const sy = Math.floor(((y - top) * SPRITE_SIZE) / drawn);
      if (x >= left && y >= top && sx >= 0 && sy >= 0 && sx < SPRITE_SIZE && sy < SPRITE_SIZE) {
        const from = (sy * sprite.width + sx) * 4;
        if ((sprite.pixels[from + 3] ?? 0) > 0) {
          color = [sprite.pixels[from] ?? 0, sprite.pixels[from + 1] ?? 0, sprite.pixels[from + 2] ?? 0];
        }
      }
      out[to] = color[0] ?? 0;
      out[to + 1] = color[1] ?? 0;
      out[to + 2] = color[2] ?? 0;
      out[to + 3] = 255;
    }
  }
  return out;
}

/** The files an `.iconset` folder needs: name and size in pixels. */
const ICONSET: readonly (readonly [string, number])[] = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

function main(): void {
  const buildDir = resolve(import.meta.dirname, '../../build');
  const iconset = resolve(buildDir, 'icon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  for (const [name, size] of ICONSET) writeFileSync(resolve(iconset, name), encodePng(size, size, renderIcon(size)));
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', resolve(buildDir, 'icon.icns')]);
  rmSync(iconset, { recursive: true, force: true });
  console.log(`Wrote ${resolve(buildDir, 'icon.icns')}`);
}

// Run only as a script, not when a test imports the helpers.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
