/**
 * Minimal store-only (uncompressed) ZIP writer, used so "Download project"
 * (Section 12) can produce a real .zip client-side without adding a new
 * dependency just for this one feature. No compression — files are
 * stored as-is, which the ZIP format fully supports.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function writeUint32LE(view, offset, value) {
  view.setUint32(offset, value, true);
}
function writeUint16LE(view, offset, value) {
  view.setUint16(offset, value, true);
}

/** Builds a ZIP archive (as a Blob) from `[{ path, content }]` files. */
export function buildZip(files) {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    if (!file?.path) continue;
    const nameBytes = encoder.encode(file.path.replace(/^\/+/, ''));
    const dataBytes = encoder.encode(file.content ?? '');
    const crc = crc32(dataBytes);

    const localHeader = new DataView(new ArrayBuffer(30));
    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20); // version needed
    writeUint16LE(localHeader, 6, 0); // flags
    writeUint16LE(localHeader, 8, 0); // method: store (no compression)
    writeUint16LE(localHeader, 10, dosTime);
    writeUint16LE(localHeader, 12, dosDate);
    writeUint32LE(localHeader, 14, crc);
    writeUint32LE(localHeader, 18, dataBytes.length); // compressed size
    writeUint32LE(localHeader, 22, dataBytes.length); // uncompressed size
    writeUint16LE(localHeader, 26, nameBytes.length);
    writeUint16LE(localHeader, 28, 0); // extra field length

    localParts.push(new Uint8Array(localHeader.buffer), nameBytes, dataBytes);

    const centralHeader = new DataView(new ArrayBuffer(46));
    writeUint32LE(centralHeader, 0, 0x02014b50);
    writeUint16LE(centralHeader, 4, 20); // version made by
    writeUint16LE(centralHeader, 6, 20); // version needed
    writeUint16LE(centralHeader, 8, 0);
    writeUint16LE(centralHeader, 10, 0);
    writeUint16LE(centralHeader, 12, dosTime);
    writeUint16LE(centralHeader, 14, dosDate);
    writeUint32LE(centralHeader, 16, crc);
    writeUint32LE(centralHeader, 20, dataBytes.length);
    writeUint32LE(centralHeader, 24, dataBytes.length);
    writeUint16LE(centralHeader, 28, nameBytes.length);
    writeUint16LE(centralHeader, 30, 0); // extra length
    writeUint16LE(centralHeader, 32, 0); // comment length
    writeUint16LE(centralHeader, 34, 0); // disk number
    writeUint16LE(centralHeader, 36, 0); // internal attrs
    writeUint32LE(centralHeader, 38, 0); // external attrs
    writeUint32LE(centralHeader, 42, offset); // local header offset

    centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes);

    offset += 30 + nameBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  centralParts.forEach((part) => {
    centralSize += part.length;
  });

  const end = new DataView(new ArrayBuffer(22));
  writeUint32LE(end, 0, 0x06054b50);
  writeUint16LE(end, 4, 0);
  writeUint16LE(end, 6, 0);
  writeUint16LE(end, 8, files.length);
  writeUint16LE(end, 10, files.length);
  writeUint32LE(end, 12, centralSize);
  writeUint32LE(end, 16, centralStart);
  writeUint16LE(end, 20, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export function downloadZip(files, filename = 'project.zip') {
  const blob = buildZip(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
