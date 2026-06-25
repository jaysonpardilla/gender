// Downloads the pdfjs-dist tarball for a given version, extracts
// the pdf.worker.* file and saves it to public/pdf.worker.min.js
// Usage: node scripts/fetch_pdf_worker_tgz.cjs

const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const version = '5.4.296';
const tarballUrl = `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-${version}.tgz`;
const outDir = path.resolve(__dirname, '..', 'public');
const outFile = path.join(outDir, 'pdf.worker.min.js');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  try {
    console.log('Trying tarball:', tarballUrl);
    const tgz = await fetchBuffer(tarballUrl);
    console.log('Downloaded tarball, size:', tgz.length);
    const buf = zlib.gunzipSync(tgz);

    let idx = 0;
    let found = false;

    while (idx + 512 <= buf.length) {
      const header = buf.slice(idx, idx + 512);
      // check for all-zero header (end of archive)
      let allZero = true;
      for (let i = 0; i < 512; i++) {
        if (header[i] !== 0) { allZero = false; break; }
      }
      if (allZero) break;

      // name field (100) and prefix field (155 at offset 345) per USTAR
      const namePart = header.slice(0, 100).toString('utf8').replace(/\0.*$/s, '');
      const prefixPart = header.slice(345, 500).toString('utf8').replace(/\0.*$/s, '');
      let name = namePart;
      if (prefixPart && prefixPart.trim()) {
        name = `${prefixPart.replace(/\/$/, '')}/${namePart}`;
      }

      const sizeOct = header.slice(124, 124 + 12).toString('utf8').replace(/\0.*$/s, '').trim();
      const size = sizeOct ? parseInt(sizeOct, 8) : 0;
      const contentStart = idx + 512;

      // Normalize and search for any file that includes pdf.worker
      const lname = (name || '').toLowerCase();
      if (lname && lname.includes('pdf.worker')) {
        console.log('Found candidate in tarball:', name, 'size:', size);
        const fileBuf = buf.slice(contentStart, contentStart + size);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outFile, fileBuf);
        console.log('Saved', outFile);
        found = true;
        break;
      }

      // advance to next header (file content is padded to 512-byte blocks)
      const padded = Math.ceil(size / 512) * 512;
      idx = contentStart + padded;
    }

    if (!found) {
      throw new Error('pdf.worker file not found inside tarball');
    }

    process.exit(0);
  } catch (err) {
    console.error('Failed to extract worker from tarball:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
