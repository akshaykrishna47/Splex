/**
 * Generates every icon size the app needs from a single source logo.
 *
 *   node scripts/make-icons.mjs
 *
 * Source of truth is assets/logo.png. Re-run after replacing it.
 *
 * Done by hand rather than with sharp/ImageMagick so the project keeps zero
 * native image dependencies — this runs once, on demand, not in the app.
 *
 * Two details that matter and are easy to get wrong:
 *
 *   - Downscaling is done on PREMULTIPLIED alpha. Averaging straight RGBA
 *     across a transparent edge pulls the invisible (0,0,0,0) pixels into the
 *     colour average and leaves a dark halo around the artwork.
 *   - iOS app icons must be fully opaque, and maskable PWA icons get cropped to
 *     a circle by the launcher. Those two get a solid background and inset
 *     artwork; everything else keeps its transparency.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const SOURCE = 'assets/logo.png';
/** Theme background, from lib/theme.ts `colors.bg`. */
const BG = { r: 0x0a, g: 0x0b, b: 0x0f };

// ---------------------------------------------------------------------------
// PNG decode
// ---------------------------------------------------------------------------

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  if (buffer[24] !== 8 || colorType !== 6) {
    throw new Error(`expected 8-bit RGBA, got depth ${buffer[24]} colorType ${colorType}`);
  }

  const parts = [];
  let offset = 8;
  while (offset < buffer.length - 8) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const data = Buffer.alloc(height * stride);

  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[pos + x];
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0;

      let out;
      if (filter === 0) out = value;
      else if (filter === 1) out = value + left;
      else if (filter === 2) out = value + up;
      else if (filter === 3) out = value + ((left + up) >> 1);
      else out = value + paeth(left, up, upLeft);

      data[y * stride + x] = out & 0xff;
    }
    pos += stride;
  }

  return { width, height, data };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ---------------------------------------------------------------------------
// PNG encode
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, data) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    rows[y * (stride + 1)] = 0; // filter: none
    data.copy(rows, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Resize (box filter, on premultiplied alpha)
// ---------------------------------------------------------------------------

function resize(src, width, height = width) {
  const dst = Buffer.alloc(width * height * 4);
  const scaleX = src.width / width;
  const scaleY = src.height / height;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));

    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;

      for (let sy = y0; sy < y1 && sy < src.height; sy += 1) {
        for (let sx = x0; sx < x1 && sx < src.width; sx += 1) {
          const i = (sy * src.width + sx) * 4;
          const alpha = src.data[i + 3];
          // Premultiply so transparent pixels contribute no colour.
          r += src.data[i] * alpha;
          g += src.data[i + 1] * alpha;
          b += src.data[i + 2] * alpha;
          a += alpha;
          n += 1;
        }
      }

      const j = (y * width + x) * 4;
      if (a === 0 || n === 0) {
        dst[j] = 0;
        dst[j + 1] = 0;
        dst[j + 2] = 0;
        dst[j + 3] = 0;
      } else {
        dst[j] = Math.round(r / a);
        dst[j + 1] = Math.round(g / a);
        dst[j + 2] = Math.round(b / a);
        dst[j + 3] = Math.round(a / n);
      }
    }
  }

  return { width, height, data: dst };
}

/**
 * Place `logo` on a `size` canvas at `inset` (0–1 fraction of the canvas the
 * artwork occupies), optionally over an opaque background.
 */
function compose(logo, size, { background = null, inset = 1 } = {}) {
  const canvas = Buffer.alloc(size * size * 4);

  if (background) {
    for (let i = 0; i < size * size; i += 1) {
      canvas[i * 4] = background.r;
      canvas[i * 4 + 1] = background.g;
      canvas[i * 4 + 2] = background.b;
      canvas[i * 4 + 3] = 255;
    }
  }

  // Fit inside the box preserving aspect ratio, then centre. The source logo is
  // not necessarily square — scaling width and height independently to fill a
  // square canvas would visibly stretch it.
  const box = Math.round(size * inset);
  const scale = Math.min(box / logo.width, box / logo.height);
  const artWidth = Math.max(1, Math.round(logo.width * scale));
  const artHeight = Math.max(1, Math.round(logo.height * scale));

  const art = resize(logo, artWidth, artHeight);
  const offsetX = Math.round((size - artWidth) / 2);
  const offsetY = Math.round((size - artHeight) / 2);

  for (let y = 0; y < artHeight; y += 1) {
    for (let x = 0; x < artWidth; x += 1) {
      const s = (y * artWidth + x) * 4;
      const alpha = art.data[s + 3] / 255;
      if (alpha === 0) continue;

      const d = ((y + offsetY) * size + (x + offsetX)) * 4;
      const under = canvas[d + 3] / 255;
      const outA = alpha + under * (1 - alpha);

      for (let c = 0; c < 3; c += 1) {
        canvas[d + c] = Math.round(
          (art.data[s + c] * alpha + canvas[d + c] * under * (1 - alpha)) / (outA || 1),
        );
      }
      canvas[d + 3] = Math.round(outA * 255);
    }
  }

  return canvas;
}

function write(path, size, options) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(size, size, compose(logo, size, options)));
  const kind = options?.background ? 'opaque' : 'transparent';
  console.log(`  ${path.padEnd(38)} ${size}x${size}  ${kind}`);
}

// ---------------------------------------------------------------------------

const logo = decodePng(readFileSync(SOURCE));
console.log(`source ${SOURCE} — ${logo.width}x${logo.height}\n`);

// Transparent: sit on whatever background the surface provides.
write('assets/favicon.png', 96);
write('assets/splash-icon.png', 1024, { inset: 0.7 });
write('public/icons/icon-1024.png', 1024);

// Opaque: iOS rejects alpha in app icons.
write('assets/icon.png', 1024, { background: BG, inset: 0.8 });

// Adaptive/maskable get inset artwork — launchers crop to a circle, and
// anything outside roughly the middle 80% can be clipped away.
write('assets/android-icon-foreground.png', 1024, { inset: 0.62 });
write('public/icons/icon-512-maskable.png', 512, { background: BG, inset: 0.6 });

console.log('\ndone');
