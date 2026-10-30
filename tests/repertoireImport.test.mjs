import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMxlArchive, MAX_EXPANDED_BYTES, MAX_MXL_BYTES,
  RepertoireImportError, sanitizedRepertoireXml } from '../src/core/notation/repertoireImport.ts';
import { makeMxl, makeZip, DEMO_XML, CONTAINER_XML } from './repertoireFixtures.mjs';

test('accept a proper compressed MXL containing a nested rootfile', () => {
  const bytes = makeMxl();
  const result = validateMxlArchive(bytes);
  assert.equal(result.entries, 3);
  assert.ok(result.expandedBytes >= Buffer.byteLength(DEMO_XML));
});

test('reject invalid signatures, missing container and zip-slip entries', () => {
  const invalidArchives = [
    Buffer.from('not a zip'),
    makeZip([['scores/demo.musicxml', DEMO_XML]]),
    makeZip([['META-INF/container.xml', CONTAINER_XML],
      ['../evil.musicxml', DEMO_XML]]),
    makeZip([['META-INF/container.xml', CONTAINER_XML],
      ['scores/demo.musicxml', DEMO_XML], ['scores/demo.musicxml', DEMO_XML]])
  ];
  for (const bytes of invalidArchives) {
    assert.throws(() => validateMxlArchive(bytes), RepertoireImportError);
  }
});

test('reject encrypted entries, oversized inflated contents and tampered directories', () => {
  const original = makeMxl();
  const readCentralOffset = bytes => bytes.readUInt32LE(bytes.length - 22 + 16);
  const encrypted = Buffer.from(original);
  encrypted.writeUInt16LE(0x801, readCentralOffset(encrypted) + 8);
  assert.throws(() => validateMxlArchive(encrypted), /неподдерживаемые|зашифрованные/);

  const inflated = Buffer.from(original);
  inflated.writeUInt32LE(MAX_EXPANDED_BYTES + 1, readCentralOffset(inflated) + 24);
  assert.throws(() => validateMxlArchive(inflated), /слишком велики/);

  const damaged = Buffer.from(original);
  damaged.writeUInt32LE(0xffffffff, damaged.length - 22 + 16);
  assert.throws(() => validateMxlArchive(damaged), /ZIP64/);

  assert.throws(() => validateMxlArchive(Buffer.alloc(MAX_MXL_BYTES + 1)), /20 МБ/);
});

test('canonical MusicXML public DTD is removed; hostile XML declarations are rejected', () => {
  const publicDtd = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
  const original = DEMO_XML.replace('<score-partwise', publicDtd + '\n<score-partwise');
  const safe = sanitizedRepertoireXml(original);
  assert.ok(!safe.includes('<!DOCTYPE'));
  assert.ok(safe.includes('Local repertoire sample'));
  assert.throws(() => sanitizedRepertoireXml(
    '<!DOCTYPE score-partwise SYSTEM "https://attacker.invalid/evil"><score-partwise/>'
  ), RepertoireImportError);
  assert.throws(() => sanitizedRepertoireXml(
    '<!DOCTYPE score-partwise [<!ENTITY attack SYSTEM "https://attacker.invalid/x">]><score-partwise>&attack;</score-partwise>'
  ), RepertoireImportError);
});
