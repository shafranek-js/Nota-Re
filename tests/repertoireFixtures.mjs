import { deflateRawSync } from 'node:zlib';

export const DEMO_XML = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <work><work-title>Local repertoire sample</work-title></work>
  <movement-title>Local repertoire sample</movement-title>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno</part-abbreviation>
    <score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

export const DEMO_MULTI_XML = DEMO_XML.replace(
  '</part-list>',
  '<score-part id="P2"><part-name>Left hand</part-name></score-part></part-list>'
).replace(
  '</score-partwise>',
  `<part id="P2"><measure number="1">
  <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
  <time><beats>4</beats><beat-type>4</beat-type></time>
  <clef><sign>F</sign><line>4</line></clef></attributes>
  <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
  </measure></part></score-partwise>`
);

export const CONTAINER_XML = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="scores/demo.musicxml"
    media-type="application/vnd.recordare.musicxml+xml"/></rootfiles>
</container>`;

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

export function makeZip(entries, { compressed = true } = {}) {
  const parts = [], directory = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const path = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const data = compressed ? deflateRawSync(raw) : raw;
    const method = compressed ? 8 : 0;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(path.length, 26);
    parts.push(local, path, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(path.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, path);
    offset += local.length + path.length + data.length;
  }
  const size = directory.reduce((sum, bytes) => sum + bytes.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(size, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, eocd]);
}

export function makeMxl({ xml = DEMO_XML } = {}) {
  return makeZip([
    ['mimetype', 'application/vnd.recordare.musicxml'],
    ['META-INF/container.xml', CONTAINER_XML],
    ['scores/demo.musicxml', xml]
  ]);
}
