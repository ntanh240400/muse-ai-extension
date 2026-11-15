import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

/**
 * Creates a raw RGBA PNG buffer
 */
function createPng(width, height, pixelShader) {
  // 1. Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth 8
  ihdrData[9] = 6; // color type 6: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = writeChunk('IHDR', ihdrData);

  // 3. Raw Scanline Data (1 filter byte 0x00 per row + width * 4 bytes RGBA)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelShader(x, y, width, height);
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  // 4. Compress with Deflate (IDAT Chunk)
  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = writeChunk('IDAT', compressedData);

  // 5. IEND Chunk
  const iendChunk = writeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Procedural icon painter with 1Password aesthetic:
 * Rounded squircle background, glowing border, and MuseVault 'M' / Vault keyhole symbol.
 */
function iconShader(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = w * 0.42;

  // Normalized coordinates [-1, 1]
  const nx = (x - cx) / (w / 2);
  const ny = (y - cy) / (h / 2);

  // Squircle distance: (x^4 + y^4)^(1/4)
  const squircleDist = Math.pow(Math.pow(Math.abs(nx), 3.5) + Math.pow(Math.abs(ny), 3.5), 1 / 3.5);

  // Transparent outside the squircle
  if (squircleDist > 0.95) {
    const aa = Math.max(0, 1 - (squircleDist - 0.95) / 0.05);
    if (aa <= 0) return [0, 0, 0, 0];
  }

  // Base gradient: Obsidian blue-gray (#121721 to #0a0e17)
  const gradT = (y / h);
  let r = 18 * (1 - gradT) + 10 * gradT;
  let g = 24 * (1 - gradT) + 14 * gradT;
  let b = 36 * (1 - gradT) + 24 * gradT;
  let a = 255;

  // Outer border glow: Cobalt blue (#0A85EA)
  if (squircleDist > 0.82 && squircleDist <= 0.95) {
    const borderIntensity = (squircleDist - 0.82) / 0.13;
    r = r * (1 - borderIntensity) + 10 * borderIntensity;
    g = g * (1 - borderIntensity) + 133 * borderIntensity;
    b = b * (1 - borderIntensity) + 234 * borderIntensity;
  }

  // Inner glyph drawing: Stylized 'M' with central vault node
  // Scale independent coords [0, 1]
  const gx = x / w;
  const gy = y / h;

  // Check if pixel is part of 'M' letter
  // Two vertical legs at x ~ 0.28 and x ~ 0.72
  // Two diagonal strokes meeting in the middle at (0.5, 0.62)
  const isLeftLeg = (gx >= 0.24 && gx <= 0.36 && gy >= 0.28 && gy <= 0.72);
  const isRightLeg = (gx >= 0.64 && gx <= 0.76 && gy >= 0.28 && gy <= 0.72);

  // Left diagonal: from (0.30, 0.32) down to (0.50, 0.60)
  // Distance from point to line segment
  const diagWidth = 0.06;
  const leftDiag = (gy >= 0.30 && gy <= 0.62 && Math.abs((gy - 0.30) / (0.60 - 0.30) * (0.50 - 0.30) + 0.30 - gx) < diagWidth);
  const rightDiag = (gy >= 0.30 && gy <= 0.62 && Math.abs((gy - 0.30) / (0.60 - 0.30) * (0.30 - 0.50) + 0.70 - gx) < diagWidth);

  // Center vault glow node (keyhole or gem) at (0.50, 0.65)
  const nodeDist = Math.hypot(gx - 0.5, gy - 0.66);
  const isNode = nodeDist < 0.09;

  if (isLeftLeg || isRightLeg || leftDiag || rightDiag) {
    // Pure vibrant white / light blue for glyph
    r = 255;
    g = 255;
    b = 255;
  } else if (isNode) {
    // Emerald green / cyan vault lock dot (#10B981)
    r = 16;
    g = 185;
    b = 129;
  }

  return [r, g, b, a];
}

// Ensure target directory exists
const targetDir = path.resolve(__dirname, '../assets/icons');
fs.mkdirSync(targetDir, { recursive: true });

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const pngBuffer = createPng(size, size, iconShader);
  const filePath = path.join(targetDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated icon: ${filePath} (${pngBuffer.length} bytes)`);
}

console.log('All icons generated successfully.');
