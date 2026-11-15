import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const manifestPath = 'docs/architecture/2026-11-14-locacoes-restoration-manifest.json';
const cachePath = 'node_modules/.cache/rental-restoration-source/upload-payload.json';
if (process.argv[2] === '--prepare') {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const root = path.resolve(manifest.sourceDirectory);
  const files = manifest.files.map(entry => {
    const source = path.resolve(root, entry.file);
    if (!source.startsWith(root + path.sep) || /(^|\/)\.env/.test(entry.file)) throw new Error('File outside reviewed source.');
    const bytes = fs.readFileSync(source);
    const sha = crypto.createHash('sha1').update(bytes).digest('hex');
    if (sha !== entry.sha || bytes.length !== entry.size) throw new Error(`Source changed: ${entry.file}`);
    return { ...entry, data: bytes.toString('base64') };
  });
  const payload = JSON.stringify(files);
  fs.writeFileSync(cachePath, payload);
  console.log(JSON.stringify({ files: files.length, length: payload.length }));
} else {
  const offset = Number(process.argv[2]);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid offset.');
  const data = fs.readFileSync(cachePath, 'utf8');
  console.log(JSON.stringify({ offset, data: data.slice(offset, offset + 24000) }));
}
