const fs = require('fs');
const https = require('https');
const path = require('path');

const url = 'https://storage.googleapis.com/static.antigravity.ai/projects/5fd6yqa62hbxn7a35cgfuf/attivos_logo.png';
const dest = path.join(process.cwd(), 'public', 'logo.png');

const file = fs.createWriteStream(dest);
https.get(url, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download: ${response.statusCode}`);
    return;
  }
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Download completed');
  });
}).on('error', (err) => {
  fs.unlink(dest, () => {});
  console.error('Error downloading file:', err.message);
});
