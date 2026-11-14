import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotWriter, SaveConflict } from '../../vendor/personal-mindmap/src/fusion/persistence';

test('queued edits serialize against last persisted snapshot', async () => {
  let disk = 'A';
  const writer = new SnapshotWriter('A', async transform => { disk = transform(disk); });
  await Promise.all([writer.write('B'), writer.write('C')]);
  assert.equal(disk, 'C');
});
test('external modification is never overwritten', async () => {
  let disk = 'external';
  const writer = new SnapshotWriter('original', async transform => { disk = transform(disk); });
  await assert.rejects(writer.write('local'), SaveConflict);
  assert.equal(disk, 'external');
  assert.equal(writer.pending, 'local');
});
test('failed write leaves expected snapshot unchanged and permits retry', async () => {
  let disk = 'A'; let fail = true;
  const writer = new SnapshotWriter('A', async transform => { if (fail) throw new Error('disk'); disk = transform(disk); });
  await assert.rejects(writer.write('B'), /disk/);
  fail = false;
  await writer.write('B');
  assert.equal(disk, 'B');
});

test('recognizes every queued own snapshot and stops recognizing obsolete completed snapshots', async () => {
 let release!:()=>void;
 const gate = new Promise<void>(resolve=>release=resolve);
 let disk='A';
 const writer = new SnapshotWriter('A', async transform => {await gate;disk=transform(disk);});
 const first=writer.write('B'), second=writer.write('C');
 assert.equal(writer.isOwnSnapshot('A'),true);
 assert.equal(writer.isOwnSnapshot('B'),true);
 assert.equal(writer.isOwnSnapshot('C'),true);
 assert.equal(writer.isOwnSnapshot('external'),false);
 release();await Promise.all([first,second]);
 assert.equal(writer.isOwnSnapshot('B'),false);
 assert.equal(writer.isOwnSnapshot('C'),true);
});
