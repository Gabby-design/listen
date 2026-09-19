const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal PNG encoder in pure Node.js
function createPNG(width, height, pixelFn) {
  // Pixel buffer with 1 filter byte per row (0 = None) + 4 bytes RGBA per pixel
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Helper to write chunk
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const toCrc = Buffer.concat([typeBuf, data]);

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(toCrc), 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC-32 table generator
function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. App Icon (64x64) - Violet circle with microphone
const appIcon = createPNG(64, 64, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

  // Circle background: #6366f1
  if (dist < 28) {
    // Mic shape inside
    // Mic capsule: x in [26, 38], y in [16, 32]
    if (x >= 27 && x <= 37 && y >= 16 && y <= 32) {
      return [255, 255, 255, 255];
    }
    // Mic stand arc: y in [28, 38], x around arc
    const arcDist = Math.abs(Math.sqrt((x - cx) ** 2 + (y - 30) ** 2) - 10);
    if (arcDist <= 1.8 && y >= 26 && y <= 40) {
      return [255, 255, 255, 255];
    }
    // Mic stem: x in [30, 34], y in [40, 46]
    if (x >= 30 && x <= 34 && y >= 40 && y <= 46) {
      return [255, 255, 255, 255];
    }
    // Mic base: x in [24, 40], y in [46, 48]
    if (x >= 24 && x <= 40 && y >= 46 && y <= 49) {
      return [255, 255, 255, 255];
    }

    return [99, 102, 241, 255];
  }

  return [0, 0, 0, 0];
});

fs.writeFileSync(path.join(assetsDir, 'icon.png'), appIcon);

// 2. Tray Icon (32x32) - Clean white/indigo microphone
const trayIcon = createPNG(32, 32, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;

  // Mic capsule: x in [13, 19], y in [6, 16]
  if (x >= 13 && x <= 19 && y >= 6 && y <= 16) {
    return [255, 255, 255, 255];
  }
  // Arc around capsule
  const arcDist = Math.abs(Math.sqrt((x - cx) ** 2 + (y - 14) ** 2) - 6);
  if (arcDist <= 1.2 && y >= 12 && y <= 20) {
    return [255, 255, 255, 255];
  }
  // Stem: x in [15, 17], y in [20, 24]
  if (x >= 15 && x <= 17 && y >= 20 && y <= 24) {
    return [255, 255, 255, 255];
  }
  // Base: x in [11, 21], y in [24, 26]
  if (x >= 11 && x <= 21 && y >= 24 && y <= 26) {
    return [255, 255, 255, 255];
  }

  return [0, 0, 0, 0];
});

fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), trayIcon);
console.log('Icons generated successfully in assets/ directory');
