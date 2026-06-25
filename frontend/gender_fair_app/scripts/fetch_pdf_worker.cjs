// Fetches a usable pdf.worker.min.js into public/ for local dev.
// Usage: node scripts/fetch_pdf_worker.cjs

const fs = require('fs');
const path = require('path');
const https = require('https');

const outDir = path.resolve(__dirname, '..', 'public');
const outFile = path.join(outDir, 'pdf.worker.min.js');

// Recommended version used by react-pdf in this project. Adjust if necessary.
const version = '3.11.174';

const candidates = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`,
  `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`,
  `https://esm.run/pdfjs-dist@${version}/build/pdf.worker.min.js`,
  `https://cdn.skypack.dev/pdfjs-dist@${version}/build/pdf.worker.min.js`,
  `https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist/build/pdf.worker.min.js`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`,
];

function fetchToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

(async () => {
  try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const url of candidates) {
      try {
        console.log('Trying', url);
        await fetchToFile(url, outFile);
        console.log('Saved pdf.worker.min.js to', outFile);
        process.exit(0);
      } catch (err) {
        console.warn('Failed to fetch from', url, err.message);
      }
    }

    console.error('All candidates failed. Please check network or adjust the version in scripts/fetch_pdf_worker.cjs');
    process.exit(1);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
