const net = require('net');

const startsWith = (buffer, bytes, offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte);

const detectedMimeType = buffer => {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(buffer, [0x42, 0x4d])) return 'image/bmp';
  if (
    startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a])
  ) return 'image/tiff';
  if (startsWith(buffer, [0x44, 0x49, 0x43, 0x4d], 128)) return 'application/dicom';
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return 'application/x-ole-storage';
  }
  if (!buffer.subarray(0, 4096).includes(0)) return 'text/plain';
  return 'application/octet-stream';
};

const compatibleMimeType = (declared, detected) => {
  if (declared === detected) return true;
  if (
    detected === 'application/zip' &&
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ].includes(declared)
  ) return true;
  if (
    detected === 'application/x-ole-storage' &&
    ['application/msword', 'application/vnd.ms-excel'].includes(declared)
  ) return true;
  if (detected === 'text/plain' && ['text/plain', 'text/csv'].includes(declared)) return true;
  return false;
};

const scanWithClamav = buffer => new Promise((resolve, reject) => {
  const socket = net.createConnection({
    host: process.env.CLAMAV_HOST || 'clamav',
    port: Number(process.env.CLAMAV_PORT) || 3310,
    timeout: Number(process.env.CLAMAV_TIMEOUT_MS) || 30000
  });
  const chunks = [];

  socket.on('connect', () => {
    socket.write('zINSTREAM\0');
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < buffer.length; offset += chunkSize) {
      const chunk = buffer.subarray(offset, offset + chunkSize);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(chunk.length);
      socket.write(length);
      socket.write(chunk);
    }
    socket.end(Buffer.alloc(4));
  });
  socket.on('data', chunk => chunks.push(chunk));
  socket.on('timeout', () => socket.destroy(new Error('Malware scanner timed out')));
  socket.on('error', reject);
  socket.on('close', hadError => {
    if (hadError) return;
    const response = Buffer.concat(chunks).toString('utf8');
    if (response.includes('FOUND')) return resolve({ clean: false, response });
    if (response.includes('OK')) return resolve({ clean: true, response });
    return reject(new Error('Malware scanner returned an invalid response'));
  });
});

const inspectFile = async file => {
  const detected = detectedMimeType(file.buffer);
  if (!compatibleMimeType(file.mimetype, detected)) {
    throw new Error('File content does not match the declared type');
  }
  const scan = await scanWithClamav(file.buffer);
  if (!scan.clean) throw new Error('File failed malware scanning');
  return { detectedMimeType: detected, malwareScanStatus: 'clean' };
};

module.exports = {
  compatibleMimeType,
  detectedMimeType,
  inspectFile,
  scanWithClamav
};
