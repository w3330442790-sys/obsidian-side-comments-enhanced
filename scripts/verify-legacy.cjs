// Read-only compatibility check. Run with the user's vault path; report remains private.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const vault = process.argv[2];
if (!vault) throw Error('Usage: node scripts/verify-legacy.cjs <vault-path>');
const backup = path.join(root, 'private/backup-20261104/side-note-data');
const entries = [];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const name of fs.readdirSync(backup).filter(x => x.endsWith('.json'))) {
  const bytes = fs.readFileSync(path.join(vault, 'side-note-data', name));
  assert.equal(hash(bytes), hash(fs.readFileSync(path.join(backup, name))), 'Annotation file changed from backup: ' + name);
  const comments = JSON.parse(bytes.toString('utf8'));
  for (const comment of comments) {
    assert.equal(typeof comment.filePath, 'string');
    assert.equal(typeof comment.selectedText, 'string');
    assert.equal(typeof comment.timestamp, 'number');
  }
  entries.push({ name, count: comments.length, sha256: hash(bytes), withBody: comments.filter(x => x.comment).length,
    orphaned: comments.filter(x => x.isOrphaned).length, withStyle: comments.filter(x => x.markType).length, withColor: comments.filter(x => x.color).length,
    missingSourceCount: comments.filter(x => !fs.existsSync(path.join(vault, x.filePath))).length });
}
const report = { timestamp: new Date().toISOString(), total: entries.reduce((n, x) => n + x.count, 0), files: entries };
fs.writeFileSync(path.join(root, 'private/compatibility.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ files: entries.length, total: report.total, byteIdenticalToBackup: true }));
