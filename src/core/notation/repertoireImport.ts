/**
 * Safety and format gate for locally selected MusicXML / MXL documents.
 * This is intentionally a validator, NOT an alternate engraving/parser engine:
 * OSMD receives the original File after inspection.
 */
export const MAX_XML_BYTES = 10 * 1024 * 1024;
export const MAX_MXL_BYTES = 20 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 128;

export type RepertoireFormat = 'xml' | 'mxl';

export interface RepertoireFileInfo {
  readonly file: File;
  readonly format: RepertoireFormat;
  readonly title: string;
  readonly warnings: readonly string[];
  readonly parts: number | null;
  readonly measures: number | null;
}

export class RepertoireImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepertoireImportError';
  }
}

const invalid = (message: string): never => { throw new RepertoireImportError(message); };
const u16 = (view: DataView, at: number): number => view.getUint16(at, true);
const u32 = (view: DataView, at: number): number => view.getUint32(at, true);

/**
 * Inspect the ZIP central directory *before* passing a compressed document
 * to OSMD. No archive entry is decompressed here. Reject encrypted, zip64,
 * zip-slip, ambiguous and oversized archives so OSMD never sees arbitrary
 * unbounded ZIP input.
 */
export function validateMxlArchive(bytes: Uint8Array): { readonly entries: number; readonly expandedBytes: number } {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_MXL_BYTES) {
    return invalid('Размер MXL превышает допустимый предел 20 МБ или архив пуст.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (u32(view, 0) !== 0x04034b50) return invalid('MXL не является ZIP-архивом.');
  let end = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 65535); i--) {
    if (u32(view, i) === 0x06054b50 && i + 22 + u16(view, i + 20) === bytes.byteLength) {
      end = i; break;
    }
  }
  if (end < 0) return invalid('Повреждённая центральная директория MXL.');
  if (u16(view, end + 4) !== 0 || u16(view, end + 6) !== 0) {
    return invalid('Многотомные ZIP-архивы не поддерживаются.');
  }
  const entries = u16(view, end + 10);
  if (entries === 0 || entries > MAX_ZIP_ENTRIES || u16(view, end + 8) !== entries) {
    return invalid('MXL содержит слишком много файлов или некорректную директорию.');
  }
  const centralSize = u32(view, end + 12);
  const centralOffset = u32(view, end + 16);
  if (centralOffset === 0xffffffff || centralSize === 0xffffffff ||
      entries === 0xffff || centralOffset + centralSize > end) {
    return invalid('ZIP64 и некорректные MXL-архивы не поддерживаются.');
  }
  let pos = centralOffset;
  let expanded = 0;
  let containerFound = false;
  let xmlFound = false;
  const names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > centralOffset + centralSize || u32(view, pos) !== 0x02014b50) {
      return invalid('Повреждённая запись MXL.');
    }
    const flags = u16(view, pos + 8);
    const method = u16(view, pos + 10);
    const compressed = u32(view, pos + 20);
    const uncompressed = u32(view, pos + 24);
    const nameLen = u16(view, pos + 28);
    const extraLen = u16(view, pos + 30);
    const commentLen = u16(view, pos + 32);
    const localOffset = u32(view, pos + 42);
    const next = pos + 46 + nameLen + extraLen + commentLen;
    if (next > centralOffset + centralSize || flags & 1 || ![0, 8].includes(method) ||
        compressed === 0xffffffff || uncompressed === 0xffffffff ||
        localOffset === 0xffffffff || localOffset + 30 > centralOffset ||
        u32(view, localOffset) !== 0x04034b50) {
      return invalid('MXL содержит неподдерживаемые, зашифрованные или повреждённые данные.');
    }
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    } catch {
      return invalid('Некорректное имя файла внутри MXL.');
    }
    const pieces = name.split('/');
    if (!name || name.startsWith('/') || name.includes('\\') ||
        pieces.some(part => part === '..' || part === '.') ||
        names.has(name)) {
      return invalid('MXL содержит опасный или дублирующийся путь.');
    }
    names.add(name);
    if (method === 0 && compressed !== uncompressed) {
      return invalid('Некорректная длина несжатого ZIP-файла.');
    }
    // Check all payloads are within the ZIP data area, including local headers.
    const payloadAt = localOffset + 30 + u16(view, localOffset + 26) + u16(view, localOffset + 28);
    if (payloadAt + compressed > centralOffset || uncompressed > MAX_EXPANDED_BYTES) {
      return invalid('ZIP-данные выходят за границы MXL или слишком велики.');
    }
    expanded += uncompressed;
    if (expanded > MAX_EXPANDED_BYTES) return invalid('Распакованный MXL превышает 50 МБ.');
    if (name === 'META-INF/container.xml') containerFound = true;
    if (/\.(musicxml|xml)$/i.test(name) && name !== 'META-INF/container.xml') xmlFound = true;
    pos = next;
  }
  if (pos !== centralOffset + centralSize || !containerFound || !xmlFound) {
    return invalid('MXL должен содержать META-INF/container.xml и партитуру MusicXML.');
  }
  return { entries, expandedBytes: expanded };
}

export function inspectMusicXmlText(text: string): {
  readonly title: string; readonly warnings: readonly string[];
  readonly parts: number; readonly measures: number;
} {
  if (!text.trim()) return invalid('Файл MusicXML пуст.');
  if (/<!(?:DOCTYPE|ENTITY)\b|<\?xml-stylesheet\b|<script\b/i.test(text)) {
    return invalid('Небезопасные инструкции XML (DTD, ENTITY или script) не разрешены.');
  }
  if (typeof DOMParser === 'undefined') return invalid('Этот браузер не поддерживает проверку XML.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return invalid('Некорректный синтаксис MusicXML.');
  const root = doc.documentElement;
  if (!root || !['score-partwise', 'score-timewise'].includes(root.localName)) {
    return invalid('Это не партитура MusicXML (score-partwise / score-timewise).');
  }
  const parts = root.querySelectorAll('part-list > score-part').length;
  const measures = root.querySelectorAll('measure').length;
  if (!parts || !measures) return invalid('В MusicXML отсутствует список партий или такты.');
  const title = (root.querySelector('work-title')?.textContent ||
    root.querySelector('movement-title')?.textContent || 'Без названия').trim().slice(0, 180);
  const staves = [...root.querySelectorAll('staves')].map(el => Number(el.textContent || 1));
  const warnings: string[] = [];
  if (parts > 2 || staves.some(n => n > 2)) warnings.push('Партитура содержит несколько партий или более двух станов.');
  const voices = new Set([...root.querySelectorAll('voice')].map(el => el.textContent?.trim()).filter(Boolean));
  if (voices.size > 2) warnings.push('В партитуре используется несколько голосов.');
  if (root.localName === 'score-timewise') warnings.push('Формат score-timewise может поддерживаться нотным движком не полностью.');
  return { title: title || 'Без названия', warnings, parts, measures };
}

export async function inspectRepertoireFile(file: File): Promise<RepertoireFileInfo> {
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  if (!['xml', 'musicxml', 'mxl'].includes(ext ?? '')) {
    return invalid('Поддерживаются только файлы .musicxml, .xml и .mxl.');
  }
  const format: RepertoireFormat = ext === 'mxl' ? 'mxl' : 'xml';
  if (file.size === 0 || file.size > (format === 'mxl' ? MAX_MXL_BYTES : MAX_XML_BYTES)) {
    return invalid(format === 'mxl' ? 'Размер MXL должен быть не более 20 МБ.' :
      'Размер MusicXML должен быть не более 10 МБ.');
  }
  if (format === 'mxl') {
    const zipInfo = validateMxlArchive(new Uint8Array(await file.arrayBuffer()));
    return { file, format, title: file.name.replace(/\.mxl$/i, ''),
      warnings: [`Сжатый MXL: ${zipInfo.entries} файлов. Поддержка просмотра зависит от содержимого архива.`],
      parts: null, measures: null };
  }
  const parsed = inspectMusicXmlText(await file.text());
  return { file, format, ...parsed };
}
