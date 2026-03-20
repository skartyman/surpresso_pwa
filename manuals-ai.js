import zlib from 'zlib';
import { createRequire } from 'module';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL || '';
const GAS_SECRET = process.env.GAS_SECRET || '';
const MANUAL_INDEX_FORMAT_VERSION = '2026-03-20-pdf-quality-v2';
const EMPTY_ANSWER = 'В найденных фрагментах нет достаточных данных для ответа.';
const NON_EXTRACTABLE_PDF_ERROR = 'Этот PDF пока нельзя проиндексировать автоматически';
const NON_EXTRACTABLE_PDF_REASON = 'Этот PDF нельзя нормально прочитать (скан или сложная кодировка)';
const FONT_METADATA_PATTERNS = [
  /\bmonotype\b/gi,
  /\barial(?:mt)?\b/gi,
  /\bhelvetica\b/gi,
  /\btimesnewroman(?:psmt)?\b/gi,
  /\bcourier(?:newpsmt)?\b/gi,
  /\bfontdescriptor\b/gi,
  /\bbasefont\b/gi,
  /\bcidfont\b/gi,
  /\bfontname\b/gi,
  /\btruetype\b/gi,
  /\btype0\b/gi,
  /\btype1\b/gi,
  /\bglyph(?:s)?\b/gi,
  /\bencoding\b/gi,
  /\bfont\b/gi,
];
const PDF_SPACE_GAP_MULTIPLIER = 0.18;
const TECHNICAL_TERMS = [
  'pressure', 'pump', 'pompa', 'boiler', 'sensor', 'temperature', 'thermostat', 'valve', 'solenoid',
  'flowmeter', 'flow', 'level', 'water', 'steam', 'brew', 'group', 'heater', 'heating', 'error',
  'fault', 'code', 'voltage', 'wiring', 'connector', 'fuse', 'switch', 'relay', 'probe', 'drain',
  'pressurestat', 'pid', 'gasket', 'grinder', 'hopper', 'motor', 'rpm', 'filter', 'cartridge',
  'manual', 'setup', 'install', 'calibration', 'cleaning', 'maintenance', 'descaling', 'display',
  'датчик', 'уровня', 'давление', 'помпы', 'насос', 'бойлер', 'температура', 'клапан', 'ошибка',
  'код', 'ремонт', 'схема', 'электро', 'контактор', 'предохранитель', 'манометр', 'настройка',
  'чистка', 'обслуживание', 'калибровка'
];
const TECHNICAL_TERM_SET = new Set(TECHNICAL_TERMS.map(term => normalizeText(term)));
const require = createRequire(import.meta.url);
let cachedPdfParse = undefined;
let cachedPdfJs = undefined;
const manualIndexCache = new Map();

function sanitizeText(value = '', max = 400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function assertGasConfig() {
  if (!GAS_WEBAPP_URL) throw new Error('GAS_WEBAPP_URL is not set');
  if (!GAS_SECRET) throw new Error('GAS_SECRET is not set');
}

async function gasIndexPost(payload) {
  assertGasConfig();

  const response = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: GAS_SECRET,
      ...payload,
    }),
  });

  const text = await response.text();
  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GAS returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!json.ok) throw new Error(json.error || 'GAS error');
  return json;
}

function cacheManualIndex(manualId, index, metadata = null) {
  manualIndexCache.set(String(manualId || ''), {
    index: index || null,
    metadata: metadata || null,
  });
  return index || null;
}

function getCachedManualIndex(manualId) {
  return manualIndexCache.get(String(manualId || '')) || null;
}

function clearCachedManualIndex(manualId) {
  manualIndexCache.delete(String(manualId || ''));
}

async function loadPdfJs() {
  if (cachedPdfJs !== undefined) return cachedPdfJs;
  try {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    cachedPdfJs = mod?.default || mod;
  } catch {
    cachedPdfJs = null;
  }
  return cachedPdfJs;
}

function loadPdfParse() {
  if (cachedPdfParse !== undefined) return cachedPdfParse;
  try {
    const mod = require('pdf-parse');
    cachedPdfParse = mod?.default || mod;
  } catch {
    cachedPdfParse = null;
  }
  return cachedPdfParse;
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokenize(value = '') {
  return Array.from(new Set(normalizeText(value)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)));
}

function hasCyrillic(value = '') {
  return /[\u0400-\u04FF]/u.test(String(value || ''));
}

function hasReadableLetters(value = '') {
  return /[A-Za-zА-Яа-я]/.test(String(value || ''));
}

function decodePdfString(input = '') {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char !== '\\') {
      out += char;
      continue;
    }

    const next = input[i + 1];
    if (next == null) break;

    if (/[0-7]/.test(next)) {
      let octal = next;
      for (let j = 2; j <= 3; j += 1) {
        const candidate = input[i + j];
        if (candidate && /[0-7]/.test(candidate)) {
          octal += candidate;
        } else {
          break;
        }
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i += octal.length;
      continue;
    }

    const map = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '(': '(',
      ')': ')',
      '\\': '\\',
    };
    out += map[next] ?? next;
    i += 1;
  }
  return out;
}

function decodeUtf16Be(buffer) {
  let out = '';
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    out += String.fromCharCode((buffer[i] << 8) | buffer[i + 1]);
  }
  return out;
}

function decodeHexPdfString(input = '') {
  const clean = String(input || '').replace(/[^0-9A-Fa-f]/g, '');
  if (!clean) return '';
  const even = clean.length % 2 === 0 ? clean : `${clean}0`;
  const buffer = Buffer.from(even, 'hex');

  if (!buffer.length) return '';

  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return decodeUtf16Be(buffer.subarray(2));
  }

  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    const body = buffer.subarray(2);
    if (body.length >= 2 && body.length % 2 === 0) {
      return body.swap16().toString('utf16le');
    }
  }

  const zeroBytes = Array.from(buffer).filter(byte => byte === 0).length;
  if (zeroBytes >= Math.floor(buffer.length / 3) && buffer.length >= 4) {
    try {
      return decodeUtf16Be(buffer);
    } catch {
      // ignore and fall back below
    }
  }

  return buffer.toString('latin1');
}

function decodeUnicodeHexSequence(input = '') {
  const clean = String(input || '').replace(/[^0-9A-Fa-f]/g, '');
  if (!clean) return '';
  const even = clean.length % 2 === 0 ? clean : `${clean}0`;
  const buffer = Buffer.from(even, 'hex');
  if (!buffer.length) return '';

  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return decodeUtf16Be(buffer.subarray(2));
  }

  if (buffer.length % 2 === 0 && buffer.some(byte => byte === 0)) {
    return decodeUtf16Be(buffer);
  }

  return buffer.toString('latin1');
}

function cleanupExtractedText(text = '') {
  return sanitizeText(String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
    .replace(/\b(cid|g\d+|tt\d+)\s*\+\s*/gi, ' ')
    .replace(/[\uFFFD]+/g, ' ')
    .replace(/[•·▪◦]+/g, ' • ')
    .replace(/[|¦]+/g, ' | ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' '), 120000);
}

function countBrokenUppercaseWordGroups(text = '') {
  let hits = 0;
  for (const match of String(text || '').matchAll(/\b(?:[A-Z]{1,3}\s+){1,5}[A-Z]{1,3}\b/g)) {
    const parts = match[0].trim().split(/\s+/).filter(Boolean);
    const joined = parts.join('');
    if (parts.length < 2) continue;
    if (joined.length < 5) continue;
    if (parts.some(part => part.length > 3)) continue;
    if (/^(?:AC|DC|CE|UL|EU|USA|UK|PDF|USB|LCD|LED|PCB|PID|BAR|RPM|GND)$/.test(joined)) continue;
    hits += 1;
  }
  return hits;
}

function fixBrokenUppercaseWords(text = '') {
  let output = String(text || '');
  let previous = null;

  while (output !== previous) {
    previous = output;
    output = output.replace(/\b(?:[A-Z]{1,3}\s+){1,5}[A-Z]{1,3}\b/g, match => {
      const parts = match.trim().split(/\s+/).filter(Boolean);
      const joined = parts.join('');
      if (parts.length < 2) return match;
      if (joined.length < 5) return match;
      if (parts.some(part => part.length > 3)) return match;
      if (/^(?:AC|DC|CE|UL|EU|USA|UK|PDF|USB|LCD|LED|PCB|PID|BAR|RPM|GND)$/.test(joined)) return joined;
      return joined;
    });
  }

  return output;
}

function stripFontMetadataLines(text = '') {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => sanitizeText(line, 2000))
    .filter(Boolean);

  return lines.filter(line => {
    const lowerLine = line.toLowerCase();
    const hits = FONT_METADATA_PATTERNS.reduce((count, pattern) => count + ((lowerLine.match(pattern) || []).length), 0);
    if (hits >= 2) return false;
    if (/^(?:[a-z0-9._-]+\+)?(?:arial|helvetica|courier|timesnewroman)/i.test(line)) return false;
    if (/^(?:font|encoding|basefont|fontname|cidfont|fontdescriptor)\b/i.test(line)) return false;
    return true;
  }).join('\n');
}

function cleanupReadablePageText(text = '') {
  return cleanupExtractedText(
    fixBrokenUppercaseWords(
      stripFontMetadataLines(
        String(text || '')
          .replace(/([A-Za-z])-\s+([A-Za-z])/g, '$1$2')
          .replace(/\s+([,.;:%!?])/g, '$1')
          .replace(/([(\[{])\s+/g, '$1')
          .replace(/\s+([)\]}])/g, '$1'),
      ),
    ),
  );
}

function rotateAsciiLetter(char = '', shift = 0) {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode(65 + (((code - 65 + shift) % 26) + 26) % 26);
  }
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(97 + (((code - 97 + shift) % 26) + 26) % 26);
  }
  return char;
}

function rotateAsciiText(text = '', shift = 0) {
  return Array.from(String(text || ''), char => rotateAsciiLetter(char, shift)).join('');
}

function englishHeuristicScore(text = '') {
  const source = cleanupExtractedText(text);
  if (!source) return 0;

  const tokens = tokenize(source);
  if (!tokens.length) return 0;

  const lower = source.toLowerCase();
  const commonWords = [
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'page', 'manual', 'machine', 'coffee',
    'espresso', 'group', 'steam', 'water', 'pump', 'boiler', 'pressure', 'temperature', 'filter',
    'clean', 'cleaning', 'maintenance', 'switch', 'power', 'remove', 'install', 'service',
    'button', 'display', 'error', 'setting', 'settings', 'use', 'using', 'open', 'close',
  ];
  const wordHits = commonWords.reduce((sum, word) => {
    const matchCount = lower.match(new RegExp(`\\b${word}\\b`, 'g'))?.length || 0;
    return sum + matchCount;
  }, 0);

  const technicalHits = tokens.filter(token => TECHNICAL_TERM_SET.has(token)).length;
  const vowelMatches = lower.match(/[aeiouy]/g) || [];
  const latinLetters = lower.match(/[a-z]/g) || [];
  const vowelRatio = vowelMatches.length / Math.max(latinLetters.length, 1);
  const longWords = tokens.filter(token => token.length >= 4).length;
  const badRareBigrams = (lower.match(/\b(?:qj|wq|xj|zq|vq|jj|qq|ww|yy|zx|qx)\b/g) || []).length;

  return (
    wordHits * 6
    + technicalHits * 5
    + Math.min(longWords, 30) * 0.25
    + (vowelRatio >= 0.22 && vowelRatio <= 0.48 ? 8 : 0)
    - badRareBigrams * 2
  );
}

function maybeDecodeShiftedLatinText(text = '') {
  const source = cleanupExtractedText(text);
  if (!source) return source;
  if (hasCyrillic(source)) return source;

  const latinLetters = source.match(/[A-Za-z]/g) || [];
  if (latinLetters.length < 30) return source;

  const uppercaseLetters = source.match(/[A-Z]/g) || [];
  const uppercaseRatio = uppercaseLetters.length / Math.max(latinLetters.length, 1);
  const suspiciousOriginalScore = englishHeuristicScore(source);
  let bestShift = 0;
  let bestText = source;
  let bestScore = suspiciousOriginalScore;

  for (let shift = 1; shift < 26; shift += 1) {
    const candidate = rotateAsciiText(source, -shift);
    const score = englishHeuristicScore(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
      bestText = candidate;
    }
  }

  const scoreDelta = bestScore - suspiciousOriginalScore;
  if (bestShift && scoreDelta >= 18 && (uppercaseRatio >= 0.55 || suspiciousOriginalScore <= 8)) {
    return bestText;
  }

  return source;
}

function parseNumberToken(input = '', start = 0) {
  const source = String(input || '');
  let cursor = start;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;

  const match = source.slice(cursor).match(/^[+-]?(?:\d+\.\d+|\d+|\.\d+)/);
  if (!match) return null;

  return {
    value: Number.parseFloat(match[0]),
    nextIndex: cursor + match[0].length,
  };
}

function extractLiteralStrings(segment = '') {
  const strings = [];
  let depth = 0;
  let current = '';
  let escaped = false;

  for (let i = 0; i < segment.length; i += 1) {
    const char = segment[i];

    if (!depth) {
      if (char === '(') {
        depth = 1;
        current = '';
      }
      continue;
    }

    if (escaped) {
      current += `\\${char}`;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      if (!depth) {
        strings.push(decodePdfString(current));
        current = '';
      } else {
        current += char;
      }
      continue;
    }

    current += char;
  }

  return strings;
}

function extractHexStrings(segment = '') {
  const matches = segment.match(/<([0-9A-Fa-f\s]+)>/g) || [];
  return matches
    .map(match => decodeHexPdfString(match.slice(1, -1)))
    .filter(Boolean);
}

function joinTextFragments(fragments = []) {
  return cleanupExtractedText(fragments.filter(Boolean).join(' '));
}

function shouldInsertTextSpace(previous = '', next = '') {
  if (!previous || !next) return false;
  if (/[\s([{\-/]$/u.test(previous)) return false;
  if (/^[\s)\]}.,;:%!?/-]/u.test(next)) return false;
  if (/[№#]$/u.test(previous) || /^[№#]/u.test(next)) return false;
  return true;
}

function appendTextFragment(base = '', fragment = '', gap = null, fontSize = null) {
  const next = String(fragment || '');
  if (!next) return base;
  if (!base) return next;

  const threshold = Math.max(2.5, Number(fontSize || 0) * PDF_SPACE_GAP_MULTIPLIER);
  if (gap != null && gap > threshold && shouldInsertTextSpace(base, next)) {
    return `${base} ${next}`;
  }

  if (shouldInsertTextSpace(base, next)) {
    return `${base} ${next}`;
  }

  return `${base}${next}`;
}

function buildTextFromPositionedFragments(fragments = []) {
  const rows = [];

  for (const fragment of (Array.isArray(fragments) ? fragments : [])
    .filter(item => item?.text)
    .sort((a, b) => {
      const ay = Number(a?.y || 0);
      const by = Number(b?.y || 0);
      if (Math.abs(by - ay) > 2) return by - ay;
      return Number(a?.x || 0) - Number(b?.x || 0);
    })) {
    const rowThreshold = Math.max(2.5, Number(fragment.height || fragment.fontSize || 0) * 0.35);
    const currentRow = rows[rows.length - 1];
    if (!currentRow || Math.abs(currentRow.y - fragment.y) > rowThreshold) {
      rows.push({
        y: Number(fragment.y || 0),
        items: [fragment],
      });
      continue;
    }
    currentRow.items.push(fragment);
  }

  const lines = rows.map(row => {
    let line = '';
    let lastRight = null;
    let lastFontSize = null;

    for (const item of row.items.sort((a, b) => Number(a?.x || 0) - Number(b?.x || 0))) {
      const gap = lastRight == null ? null : Number(item.x || 0) - lastRight;
      line = appendTextFragment(line, item.text, gap, item.fontSize || lastFontSize);
      lastRight = Number(item.x || 0) + Math.max(Number(item.width || 0), Math.max(String(item.text || '').length, 1) * Math.max(Number(item.fontSize || 0) * 0.4, 2));
      lastFontSize = item.fontSize || lastFontSize;
    }

    return line.trim();
  }).filter(Boolean);

  return joinTextFragments(lines);
}

function parseToUnicodeCMap(streamText = '') {
  const mapping = new Map();
  const source = String(streamText || '');

  const bfcharBlocks = source.match(/beginbfchar[\s\S]*?endbfchar/g) || [];
  for (const block of bfcharBlocks) {
    for (const match of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      mapping.set(match[1].toUpperCase(), decodeUnicodeHexSequence(match[2]));
    }
  }

  const bfrangeBlocks = source.match(/beginbfrange[\s\S]*?endbfrange/g) || [];
  for (const block of bfrangeBlocks) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      let match = line.match(/^<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>$/);
      if (match) {
        const start = Number.parseInt(match[1], 16);
        const end = Number.parseInt(match[2], 16);
        let dest = Number.parseInt(match[3], 16);
        const width = match[1].length;
        for (let code = start; code <= end; code += 1, dest += 1) {
          mapping.set(code.toString(16).toUpperCase().padStart(width, '0'), decodeUnicodeHexSequence(dest.toString(16).toUpperCase().padStart(match[3].length, '0')));
        }
        continue;
      }

      match = line.match(/^<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.+)\]$/);
      if (!match) continue;

      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const entries = [...match[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map(item => item[1]);
      const width = match[1].length;
      for (let code = start; code <= end; code += 1) {
        const destHex = entries[code - start];
        if (!destHex) break;
        mapping.set(code.toString(16).toUpperCase().padStart(width, '0'), decodeUnicodeHexSequence(destHex));
      }
    }
  }

  const codeUnitLengths = Array.from(new Set(Array.from(mapping.keys()).map(key => key.length)))
    .sort((a, b) => b - a);
  return {
    mapping,
    codeUnitLengths,
  };
}

function decodeHexPdfStringWithCMap(input = '', cmap = null) {
  const clean = String(input || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (!clean) return '';
  if (!cmap?.mapping?.size) return decodeHexPdfString(clean);

  const lengths = cmap.codeUnitLengths?.length ? cmap.codeUnitLengths : [4, 2];
  let cursor = 0;
  let output = '';

  while (cursor < clean.length) {
    let matched = false;
    for (const length of lengths) {
      const part = clean.slice(cursor, cursor + length);
      if (part.length !== length) continue;
      const decoded = cmap.mapping.get(part);
      if (decoded != null) {
        output += decoded;
        cursor += length;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    const fallbackPart = clean.slice(cursor, cursor + 2);
    output += decodeHexPdfString(fallbackPart);
    cursor += Math.max(fallbackPart.length, 2);
  }

  return output;
}

function extractTextFromStreamContent(content = '') {
  const pieces = [];
  const blocks = content.match(/BT[\s\S]*?ET/g) || [];

  for (const block of blocks) {
    const normalizedBlock = block.replace(/\r/g, '\n');
    const textOps = normalizedBlock.match(/\[(?:[^\[\]]|\([^)]*\)|<[^>]*>)*\]\s*TJ|\([^)]*\)\s*Tj|<[^>]*>\s*Tj|\([^)]*\)\s*'|<[^>]*>\s*'|\([^)]*\)\s*"|<[^>]*>\s*"/g) || [];
    for (const op of textOps) {
      const strings = [
        ...extractLiteralStrings(op),
        ...extractHexStrings(op),
      ];
      if (strings.length) pieces.push(strings.join(' '));
    }
  }

  if (!pieces.length) {
    const allStrings = [
      ...extractLiteralStrings(content),
      ...extractHexStrings(content),
    ];
    if (allStrings.length) pieces.push(allStrings.join(' '));
  }

  return joinTextFragments(pieces);
}

function parseFontResources(resourcesBody = '') {
  const fonts = new Map();
  const source = String(resourcesBody || '');
  const fontBlockMatch = source.match(/\/Font\s*<<(.*?)>>/s);
  const fontBlock = fontBlockMatch ? fontBlockMatch[1] : source;

  for (const match of fontBlock.matchAll(/\/([A-Za-z0-9_.-]+)\s+(\d+)\s+(\d+)\s+R/g)) {
    fonts.set(match[1], `${match[2]} ${match[3]}`);
  }

  return fonts;
}

function extractParentRef(pageBody = '') {
  const match = String(pageBody || '').match(/\/Parent\s+(\d+)\s+(\d+)\s+R/);
  return match ? `${match[1]} ${match[2]}` : null;
}

function resolvePageResources(pageBody = '', objectMap = new Map()) {
  const visited = new Set();
  let currentBody = String(pageBody || '');

  while (currentBody) {
    const directMatch = currentBody.match(/\/Resources\s*<<(.*?)>>/s);
    if (directMatch) return directMatch[1];

    const refMatch = currentBody.match(/\/Resources\s+(\d+)\s+(\d+)\s+R/);
    if (refMatch) {
      const ref = `${refMatch[1]} ${refMatch[2]}`;
      return objectMap.get(ref) || '';
    }

    const parentRef = extractParentRef(currentBody);
    if (!parentRef || visited.has(parentRef)) break;
    visited.add(parentRef);
    currentBody = objectMap.get(parentRef) || '';
  }

  return '';
}

function buildFontCMapIndex(objectMap = new Map(), fontRefs = new Map()) {
  const cmapByFont = new Map();

  for (const [fontName, fontRef] of fontRefs.entries()) {
    const fontBody = objectMap.get(fontRef);
    if (!fontBody) continue;
    const toUnicodeMatch = fontBody.match(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/);
    if (!toUnicodeMatch) continue;
    const cmapObjectBody = objectMap.get(`${toUnicodeMatch[1]} ${toUnicodeMatch[2]}`);
    if (!cmapObjectBody) continue;
    const cmapStream = parseStream(cmapObjectBody);
    if (!cmapStream) continue;
    const cmap = parseToUnicodeCMap(cmapStream);
    if (cmap.mapping.size) {
      cmapByFont.set(fontName, cmap);
    }
  }

  return cmapByFont;
}

function parseArrayEntries(input = '') {
  const items = [];
  const source = String(input || '');
  let cursor = 0;

  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;

    const char = source[cursor];
    if (char === '(') {
      let depth = 0;
      let escaped = false;
      let end = cursor;
      for (; end < source.length; end += 1) {
        const current = source[end];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          continue;
        }
        if (current === '(') depth += 1;
        if (current === ')') {
          depth -= 1;
          if (!depth) break;
        }
      }
      items.push({ type: 'literal', value: source.slice(cursor, end + 1) });
      cursor = end + 1;
      continue;
    }

    if (char === '<') {
      const end = source.indexOf('>', cursor + 1);
      if (end === -1) break;
      items.push({ type: 'hex', value: source.slice(cursor, end + 1) });
      cursor = end + 1;
      continue;
    }

    const numberToken = parseNumberToken(source, cursor);
    if (numberToken) {
      items.push({ type: 'number', value: numberToken.value });
      cursor = numberToken.nextIndex;
      continue;
    }

    cursor += 1;
  }

  return items;
}

function decodePdfTextOperand(token = '', fontCMap = null) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.startsWith('(') && value.endsWith(')')) {
    return decodePdfString(value.slice(1, -1));
  }
  if (value.startsWith('<') && value.endsWith('>')) {
    return decodeHexPdfStringWithCMap(value.slice(1, -1), fontCMap);
  }
  return '';
}

function extractTextFragmentsFromBlock(block = '', fontCMaps = new Map()) {
  const fragments = [];
  const source = String(block || '').replace(/\r/g, '\n');
  const tokenRegex = /\/([A-Za-z0-9_.-]+)\s+([-+]?(?:\d+\.\d+|\d+|\.\d+))\s+Tf|(\[(?:[^\[\]]|\([^)]*\)|<[^>]*>)*\]\s*TJ|\([^)]*\)\s*Tj|<[^>]*>\s*Tj|\([^)]*\)\s*'|<[^>]*>\s*'|\([^)]*\)\s*"|<[^>]*>\s*"|[-+]?(?:\d+\.\d+|\d+|\.\d+)\s+[-+]?(?:\d+\.\d+|\d+|\.\d+)\s+Td|[-+]?(?:\d+\.\d+|\d+|\.\d+)\s+[-+]?(?:\d+\.\d+|\d+|\.\d+)\s+TD)/g;
  let activeFont = null;
  let currentX = 0;
  let currentY = 0;
  let currentFontSize = 0;
  let match;

  while ((match = tokenRegex.exec(source))) {
    if (match[1]) {
      activeFont = match[1];
      currentFontSize = Number.parseFloat(match[2] || '0') || currentFontSize;
      continue;
    }

    const operation = match[3] || '';
    const moveMatch = operation.match(/^([-+]?(?:\d+\.\d+|\d+|\.\d+))\s+([-+]?(?:\d+\.\d+|\d+|\.\d+))\s+T[Dd]$/);
    if (moveMatch) {
      currentX = Number.parseFloat(moveMatch[1]) || 0;
      currentY += Number.parseFloat(moveMatch[2]) || 0;
      continue;
    }

    const fontCMap = activeFont ? fontCMaps.get(activeFont) : null;
    if (/\]\s*TJ$/.test(operation)) {
      const inside = operation.slice(1, operation.lastIndexOf(']'));
      const entries = parseArrayEntries(inside);
      let text = '';
      for (const entry of entries) {
        if (entry.type === 'number') {
          if (entry.value <= -80) text = appendTextFragment(text, ' ', 999, currentFontSize);
          continue;
        }
        const fragment = decodePdfTextOperand(entry.value, fontCMap);
        text = appendTextFragment(text, fragment, null, currentFontSize);
      }
      const cleanText = cleanupExtractedText(text);
      if (cleanText) {
        fragments.push({ text: cleanText, x: currentX, y: currentY, width: cleanText.length * Math.max(currentFontSize * 0.45, 4), height: currentFontSize || 10, fontSize: currentFontSize || 10 });
        currentX += cleanText.length * Math.max(currentFontSize * 0.45, 4);
      }
      continue;
    }

    const operandMatch = operation.match(/^(\([^)]*\)|<[^>]*>)/);
    const text = decodePdfTextOperand(operandMatch?.[1] || '', fontCMap);
    const cleanText = cleanupExtractedText(text);
    if (!cleanText) continue;
    fragments.push({ text: cleanText, x: currentX, y: currentY, width: cleanText.length * Math.max(currentFontSize * 0.45, 4), height: currentFontSize || 10, fontSize: currentFontSize || 10 });
    currentX += cleanText.length * Math.max(currentFontSize * 0.45, 4);
  }

  return fragments;
}

function parseObjectMap(pdfBuffer) {
  const pdfText = pdfBuffer.toString('latin1');
  const objectMap = new Map();
  const objectRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match;
  while ((match = objectRegex.exec(pdfText))) {
    const objectId = `${match[1]} ${match[2]}`;
    objectMap.set(objectId, match[3]);
  }
  return objectMap;
}

function parseStream(objectBody = '') {
  const streamMatch = objectBody.match(/([\s\S]*?)stream\r?\n([\s\S]*?)endstream/s);
  if (!streamMatch) return null;

  const dict = streamMatch[1] || '';
  const rawStream = streamMatch[2] || '';
  const filterMatches = [...dict.matchAll(/\/Filter\s*\/([A-Za-z0-9]+)/g)].map(match => match[1]);
  let buffer = Buffer.from(rawStream, 'latin1');

  try {
    if (filterMatches.includes('FlateDecode')) {
      try {
        buffer = zlib.inflateSync(buffer);
      } catch {
        buffer = zlib.inflateRawSync(buffer);
      }
    } else if (filterMatches.length) {
      return null;
    }
  } catch {
    return null;
  }

  return buffer.toString('latin1');
}

function extractContentsRefs(pageBody = '') {
  const refs = [];
  const single = pageBody.match(/\/Contents\s+(\d+)\s+(\d+)\s+R/);
  if (single) refs.push(`${single[1]} ${single[2]}`);

  const array = pageBody.match(/\/Contents\s*\[([\s\S]*?)\]/);
  if (array) {
    for (const ref of array[1].matchAll(/(\d+)\s+(\d+)\s+R/g)) {
      refs.push(`${ref[1]} ${ref[2]}`);
    }
  }

  return refs;
}

function extractPageTextWithFonts(pageBody = '', objectMap = new Map()) {
  const refs = extractContentsRefs(pageBody);
  if (!refs.length) return '';

  const resourcesBody = resolvePageResources(pageBody, objectMap);
  const fontRefs = parseFontResources(resourcesBody);
  const fontCMaps = buildFontCMapIndex(objectMap, fontRefs);
  const pageFragments = [];

  for (const ref of refs) {
    const objectBody = objectMap.get(ref);
    if (!objectBody) continue;
    const streamText = parseStream(objectBody);
    if (!streamText) continue;
    const blocks = streamText.match(/BT[\s\S]*?ET/g) || [];
    for (const block of blocks) {
      pageFragments.push(...extractTextFragmentsFromBlock(block, fontCMaps));
    }
  }

  return buildTextFromPositionedFragments(pageFragments);
}

function extractPageTexts(pdfBuffer) {
  const objectMap = parseObjectMap(pdfBuffer);
  const pages = [];

  for (const [, body] of objectMap) {
    if (!/\/Type\s*\/Page\b/.test(body)) continue;
    const pageText = extractPageTextWithFonts(body, objectMap) || joinTextFragments(
      extractContentsRefs(body).map(ref => {
        const objectBody = objectMap.get(ref);
        const streamText = objectBody ? parseStream(objectBody) : null;
        return streamText ? extractTextFromStreamContent(streamText) : '';
      }),
    );
    if (pageText) pages.push(pageText);
  }

  return pages.map((text, index) => ({ pageNumber: index + 1, text }));
}

function fallbackExtractText(pdfBuffer) {
  const objectMap = parseObjectMap(pdfBuffer);
  const pieces = [];
  for (const [, body] of objectMap) {
    const streamText = parseStream(body);
    if (!streamText) continue;
    const text = extractTextFromStreamContent(streamText);
    if (text) pieces.push(text);
  }

  return joinTextFragments(pieces);
}

function normalizePdfJsItemText(value = '') {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPdfJsItemGeometry(item = {}) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  const scaleX = Math.abs(Number(transform[0] || 0));
  const scaleY = Math.abs(Number(transform[3] || 0));
  const height = Math.abs(Number(item?.height || 0)) || scaleY;
  const fontSize = Math.max(scaleX, scaleY, height, 1);

  return {
    text: normalizePdfJsItemText(item?.str || ''),
    x: Number(transform[4] || 0),
    y: Number(transform[5] || 0),
    width: Math.abs(Number(item?.width || 0)),
    height,
    fontSize,
    hasEOL: Boolean(item?.hasEOL),
  };
}

function buildPdfJsPageText(items = []) {
  const fragments = (Array.isArray(items) ? items : [])
    .map(extractPdfJsItemGeometry)
    .filter(item => item.text);

  if (!fragments.length) return '';

  const rows = [];

  for (const fragment of fragments.sort((a, b) => {
    const ay = Number(a?.y || 0);
    const by = Number(b?.y || 0);
    if (Math.abs(by - ay) > 2) return by - ay;
    return Number(a?.x || 0) - Number(b?.x || 0);
  })) {
    const rowThreshold = Math.max(2, Number(fragment.height || fragment.fontSize || 0) * 0.45);
    const currentRow = rows[rows.length - 1];

    if (!currentRow || Math.abs(currentRow.y - fragment.y) > rowThreshold || currentRow.forceBreak) {
      rows.push({
        y: Number(fragment.y || 0),
        items: [fragment],
        forceBreak: Boolean(fragment.hasEOL),
      });
      continue;
    }

    currentRow.items.push(fragment);
    currentRow.forceBreak = currentRow.forceBreak || Boolean(fragment.hasEOL);
  }

  const lines = rows.map(row => {
    let line = '';
    let lastRight = null;
    let lastFontSize = null;

    for (const item of row.items.sort((a, b) => Number(a?.x || 0) - Number(b?.x || 0))) {
      const gap = lastRight == null ? null : Number(item.x || 0) - lastRight;
      const fontSize = Number(item.fontSize || lastFontSize || 0);
      const joinThreshold = Math.max(0.75, fontSize * 0.08);
      const forceWordGap = Math.max(2.25, fontSize * 0.24);
      const appendWithoutSpace = gap != null && gap <= joinThreshold;

      if (!line) {
        line = item.text;
      } else if (appendWithoutSpace) {
        line = `${line}${item.text}`;
      } else if (gap != null && gap > forceWordGap && shouldInsertTextSpace(line, item.text)) {
        line = `${line} ${item.text}`;
      } else {
        line = appendTextFragment(line, item.text, gap, fontSize || lastFontSize);
      }

      lastRight = Number(item.x || 0) + Math.max(
        Number(item.width || 0),
        Math.max(String(item.text || '').length, 1) * Math.max(fontSize * 0.42, 1.2),
      );
      lastFontSize = fontSize || lastFontSize;
    }

    return sanitizeText(line, 4000);
  }).filter(Boolean);

  return cleanupReadablePageText(lines.join('\n'));
}

async function extractWithPdfJS(pdfBuffer) {
  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) return null;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    stopAtErrors: false,
    useSystemFonts: true,
  });

  let document = null;

  try {
    document = await loadingTask.promise;
    const pageEntries = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
        includeMarkedContent: false,
      });

      pageEntries.push({
        pageNumber,
        text: buildPdfJsPageText(textContent?.items || []),
      });
    }

    return {
      pageEntries,
      fullText: cleanupReadablePageText(pageEntries.map(entry => entry.text).join('\n\n')),
      meta: { numPages: document.numPages },
    };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // ignore cleanup errors
    }
    try {
      if (document) await document.destroy();
    } catch {
      // ignore cleanup errors
    }
  }
}

async function extractTextWithPdfParse(pdfBuffer) {
  const pdfParse = loadPdfParse();
  if (!pdfParse) return null;

  const pageEntries = [];
  const meta = await pdfParse(pdfBuffer, {
    pagerender: async pageData => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });

      const text = cleanupReadablePageText(
        (Array.isArray(textContent?.items) ? textContent.items : [])
          .map(item => (typeof item?.str === 'string' ? item.str : ''))
          .join(' '),
      );

      pageEntries.push({
        pageNumber: pageEntries.length + 1,
        text,
      });

      return text;
    },
  });

  return {
    pageEntries,
    fullText: cleanupReadablePageText(meta?.text || pageEntries.map(entry => entry.text).join('\n\n')),
    meta,
  };
}

function chunkPageText(text = '', pageNumber = null, chunkSize = 1100, overlap = 180) {
  if (!text) return [];
  const source = cleanupExtractedText(text).slice(0, 50000);
  const chunks = [];
  let cursor = 0;
  let index = 0;

  while (cursor < source.length) {
    const end = Math.min(source.length, cursor + chunkSize);
    let sliceEnd = end;
    if (end < source.length) {
      const boundary = source.lastIndexOf(' ', end);
      if (boundary > cursor + Math.floor(chunkSize * 0.6)) {
        sliceEnd = boundary;
      }
    }

    const content = source.slice(cursor, sliceEnd).trim();
    if (content) {
      chunks.push({
        page: pageNumber,
        index,
        text: content,
      });
      index += 1;
    }

    if (sliceEnd >= source.length) break;
    cursor = Math.max(sliceEnd - overlap, cursor + 1);
  }

  return chunks;
}

function buildManualSignature(manual = {}) {
  return [MANUAL_INDEX_FORMAT_VERSION, manual.id, manual.fileId, manual.uploadedAt, manual.size, manual.originalName].map(item => String(item || '')).join('|');
}

function analyzeTextQuality(text = '') {
  const clean = cleanupExtractedText(text);
  const tokens = tokenize(clean);
  const words = clean.split(/\s+/).filter(Boolean);
  const lowerClean = clean.toLowerCase();
  const letters = (clean.match(/\p{L}/gu) || []).length;
  const digits = (clean.match(/\p{N}/gu) || []).length;
  const normalWords = words.filter(word => /^[\p{L}][\p{L}'’-]{2,}$/u.test(word));
  const technicalHits = tokens.filter(token => TECHNICAL_TERM_SET.has(token)).length;
  const weird = (clean.match(/[^\p{L}\p{N}\s.,;:()\[\]#/%+\-°*"'!?=&]/gu) || []).length;
  const meaningfulWords = words.filter(word => /^[\p{L}]{4,}$/u.test(word));
  const shortWords = words.filter(word => /^[\p{L}]{1,2}$/u.test(word));
  const uppercaseLikeWords = words.filter(word => /^[A-Z]{2,}$/.test(word));
  const repeatedSymbolRuns = (clean.match(/([^\p{L}\p{N}\s])\1{2,}/gu) || []).length;
  const fontMetadataHits = FONT_METADATA_PATTERNS.reduce((count, pattern) => count + ((lowerClean.match(pattern) || []).length), 0);
  const mojibakeHits = (clean.match(/[ÃÂÐÑØÆŒŽŠ�]|(?:\b[a-z]*[^\p{ASCII}\p{L}\p{N}\s.,;:()\[\]#/%+\-°*"'!?=&]+[a-z]*\b)/giu) || []).length;
  const alnumRatio = (letters + digits) / Math.max(clean.length, 1);
  const weirdRatio = weird / Math.max(clean.length, 1);
  const meaningfulWordRatio = meaningfulWords.length / Math.max(words.length, 1);
  const normalWordRatio = normalWords.length / Math.max(words.length, 1);
  const shortWordRatio = shortWords.length / Math.max(words.length, 1);
  const uppercaseWordRatio = uppercaseLikeWords.length / Math.max(words.length, 1);
  const fontMetadataRatio = fontMetadataHits / Math.max(words.length, 1);
  const mojibakeRatio = mojibakeHits / Math.max(words.length, 1);
  const brokenWordSpacingHits = countBrokenUppercaseWordGroups(clean);
  const brokenWordSpacingRatio = brokenWordSpacingHits / Math.max(words.length, 1);
  return {
    text: clean,
    length: clean.length,
    wordsCount: words.length,
    uniqueTokens: tokens.length,
    meaningfulWordsCount: meaningfulWords.length,
    normalWordsCount: normalWords.length,
    lettersCount: letters,
    digitsCount: digits,
    technicalHits,
    alnumRatio,
    weirdRatio,
    meaningfulWordRatio,
    normalWordRatio,
    shortWordRatio,
    uppercaseWordRatio,
    repeatedSymbolRuns,
    fontMetadataHits,
    fontMetadataRatio,
    mojibakeHits,
    mojibakeRatio,
    brokenWordSpacingHits,
    brokenWordSpacingRatio,
    sampleTextPreview: sanitizeText(clean, 240),
  };
}

function isMeaningfulQuality(quality, { pageEntries = [], meta = null } = {}) {
  if (!quality?.length) return false;
  if (quality.length < 80) return false;
  if (quality.wordsCount < 12) return false;
  if (quality.uniqueTokens < 8) return false;
  if (quality.alnumRatio < 0.4) return false;
  if (quality.weirdRatio > 0.22) return false;

  const looksLikeUsefulTechnicalText = (
    quality.technicalHits >= 3
    || (quality.length >= 600 && quality.uniqueTokens >= 20)
    || (quality.digitsCount >= 12 && quality.uniqueTokens >= 16)
  );

  if (quality.meaningfulWordsCount < 8 && !looksLikeUsefulTechnicalText) return false;
  if (quality.normalWordsCount < 6 && !looksLikeUsefulTechnicalText) return false;
  if (quality.meaningfulWordRatio < 0.38 && !(looksLikeUsefulTechnicalText && quality.meaningfulWordRatio >= 0.2)) return false;
  if (quality.normalWordRatio < 0.2 && !(looksLikeUsefulTechnicalText && quality.normalWordRatio >= 0.12)) return false;
  if (quality.shortWordRatio > 0.55 && !(looksLikeUsefulTechnicalText && quality.shortWordRatio <= 0.72)) return false;
  if (quality.uppercaseWordRatio > 0.45 && quality.meaningfulWordsCount < 15 && !looksLikeUsefulTechnicalText) return false;
  if (quality.repeatedSymbolRuns > 6) return false;
  if (quality.mojibakeHits >= 5 && quality.mojibakeRatio > 0.02) return false;
  if (quality.fontMetadataHits >= 6 && quality.fontMetadataRatio > 0.04 && !looksLikeUsefulTechnicalText) return false;
  if (quality.fontMetadataHits >= Math.max(8, Math.floor(quality.wordsCount * 0.08)) && !looksLikeUsefulTechnicalText) return false;
  if (quality.brokenWordSpacingHits >= 4 && quality.brokenWordSpacingRatio > 0.015) return false;

  const nonEmptyPages = (Array.isArray(pageEntries) ? pageEntries : []).filter(entry => sanitizeText(entry?.text || '', 2000)).length;
  const declaredPages = Number(meta?.numpages || meta?.numPages || 0);
  if (declaredPages >= 3 && nonEmptyPages > 0 && nonEmptyPages <= Math.floor(declaredPages / 3) && quality.length < 1200 && !looksLikeUsefulTechnicalText) return false;
  if (!hasReadableLetters(quality.text)) return false;
  return true;
}

function computeQualityScore(quality, { extractor = 'unknown', pageEntries = [], meta = null } = {}) {
  if (!quality?.length) return 0;
  let score = 0;
  score += Math.min(quality.length / 80, 40);
  score += Math.min(quality.wordsCount / 12, 24);
  score += Math.min(quality.uniqueTokens / 10, 16);
  score += Math.min(quality.technicalHits * 2.5, 20);
  score += Math.min(quality.meaningfulWordsCount / 8, 16);
  score += Math.min(quality.normalWordsCount / 8, 16);
  score += quality.meaningfulWordRatio * 30;
  score += quality.normalWordRatio * 30;
  score += Math.min(quality.alnumRatio * 15, 15);
  score -= quality.weirdRatio * 120;
  score -= quality.fontMetadataHits * 4;
  score -= quality.fontMetadataRatio * 180;
  score -= quality.mojibakeHits * 5;
  score -= quality.mojibakeRatio * 220;
  score -= quality.brokenWordSpacingHits * 7;
  score -= quality.brokenWordSpacingRatio * 260;
  score -= quality.repeatedSymbolRuns * 3;

  const nonEmptyPages = (Array.isArray(pageEntries) ? pageEntries : []).filter(entry => sanitizeText(entry?.text || '', 1000)).length;
  const declaredPages = Number(meta?.numpages || meta?.numPages || 0);
  if (declaredPages && nonEmptyPages) {
    score += Math.min((nonEmptyPages / declaredPages) * 18, 18);
  } else if (nonEmptyPages) {
    score += Math.min(nonEmptyPages * 2, 12);
  }

  if (extractor === 'pdfjs-dist') score += 18;
  if (extractor === 'pdf-parse') score += 12;
  if (extractor === 'custom-cmap-page-extractor') score += 4;
  if (!isMeaningfulQuality(quality, { pageEntries, meta })) score -= 35;
  return Number(score.toFixed(2));
}

function isGarbageLikeText(text = '', meta = null) {
  const quality = analyzeTextQuality(text);
  if (!quality.length) return true;
  if (!hasReadableLetters(quality.text)) return true;
  if (quality.fontMetadataHits >= 4 && quality.fontMetadataRatio > 0.03) return true;
  if (quality.mojibakeHits >= 5 && quality.mojibakeRatio > 0.02) return true;
  if (quality.brokenWordSpacingHits >= 4 && quality.brokenWordSpacingRatio > 0.02) return true;
  if (quality.normalWordsCount < 5 && quality.wordsCount < 20) return true;
  return !isMeaningfulQuality(quality, { meta });
}

function cleanPageEntries(pageEntries = [], meta = null) {
  return (Array.isArray(pageEntries) ? pageEntries : [])
    .map(entry => ({
      pageNumber: entry?.pageNumber ?? null,
      text: cleanupReadablePageText(maybeDecodeShiftedLatinText(entry?.text || '')),
    }))
    .filter(entry => entry.text && !isGarbageLikeText(entry.text, meta));
}

function summarizeExtraction({ pageEntries = [], fullText = '', extractor = 'custom', meta = null } = {}) {
  const filteredPages = cleanPageEntries(pageEntries, meta);
  const joinedText = cleanupReadablePageText(
    maybeDecodeShiftedLatinText(fullText || filteredPages.map(entry => entry.text).join(' ')),
  );
  const quality = analyzeTextQuality(joinedText);
  const qualityScore = computeQualityScore(quality, { extractor, pageEntries: filteredPages, meta });

  return {
    extractor,
    meta,
    pages: filteredPages,
    pagesCount: filteredPages.length,
    quality,
    qualityScore,
    usable: isMeaningfulQuality(quality, { pageEntries: filteredPages, meta }),
  };
}

function buildIndexDiagnostics({ pages, chunks, quality, extractor }) {
  return {
    extractionMethod: extractor,
    extractor,
    pagesCount: Array.isArray(pages) ? pages.length : 0,
    chunksCount: Array.isArray(chunks) ? chunks.length : 0,
    sampleTextPreview: quality?.sampleTextPreview || '',
    qualityScore: computeQualityScore(quality, { extractor, pageEntries: pages }),
    quality: quality ? {
      length: quality.length,
      wordsCount: quality.wordsCount,
      uniqueTokens: quality.uniqueTokens,
      alnumRatio: Number(quality.alnumRatio.toFixed(3)),
      weirdRatio: Number(quality.weirdRatio.toFixed(3)),
      technicalHits: quality.technicalHits,
      meaningfulWordsCount: quality.meaningfulWordsCount,
      meaningfulWordRatio: Number(quality.meaningfulWordRatio.toFixed(3)),
      normalWordsCount: quality.normalWordsCount,
      normalWordRatio: Number(quality.normalWordRatio.toFixed(3)),
      shortWordRatio: Number(quality.shortWordRatio.toFixed(3)),
      fontMetadataHits: quality.fontMetadataHits,
      fontMetadataRatio: Number(quality.fontMetadataRatio.toFixed(3)),
      mojibakeHits: quality.mojibakeHits,
      mojibakeRatio: Number(quality.mojibakeRatio.toFixed(3)),
      brokenWordSpacingHits: quality.brokenWordSpacingHits,
      brokenWordSpacingRatio: Number(quality.brokenWordSpacingRatio.toFixed(3)),
    } : null,
  };
}

export async function ensureIndexDir() {
  return true;
}

export async function loadManualIndex(manualId) {
  const cached = getCachedManualIndex(manualId);
  if (cached) return cached.index;

  const out = await gasIndexPost({ action: 'indexGet', manualId });
  return cacheManualIndex(manualId, out.index || null, out.metadata || null);
}

async function saveManualIndex(index) {
  const out = await gasIndexPost({
    action: 'indexSave',
    manualId: index.manualId,
    index,
  });
  return cacheManualIndex(index.manualId, index, out.metadata || null);
}

export async function removeManualIndex(manualId) {
  await gasIndexPost({ action: 'indexDelete', manualId });
  clearCachedManualIndex(manualId);
}

export async function getIndexStatus(manual) {
  const index = await loadManualIndex(manual.id);
  if (!index) {
    return {
      status: 'not_indexed',
      updatedAt: null,
      chunksCount: 0,
      pagesCount: 0,
      sampleTextPreview: '',
      error: null,
    };
  }

  const isFresh = index.sourceSignature && index.sourceSignature === buildManualSignature(manual);
  const status = index.status === 'failed' ? 'failed' : isFresh ? 'indexed' : 'not_indexed';
  return {
    status,
    updatedAt: index.updatedAt || null,
    chunksCount: Array.isArray(index.chunks) ? index.chunks.length : 0,
    pagesCount: index.pagesCount || (Array.isArray(index.pages) ? index.pages.length : 0),
    sampleTextPreview: sanitizeText(index.sampleTextPreview || index.diagnostics?.sampleTextPreview || '', 240),
    extractionMethod: index.extractionMethod || index.extractor || index.diagnostics?.extractionMethod || null,
    qualityScore: index.qualityScore ?? index.diagnostics?.qualityScore ?? null,
    error: index.error || null,
  };
}

function buildIndexDocument(manual, pageEntries, extractionSummary) {
  const allChunks = [];
  for (const entry of pageEntries) {
    const chunks = chunkPageText(entry.text, entry.pageNumber)
      .filter(chunk => !isGarbageLikeText(chunk.text, extractionSummary?.meta));
    for (const chunk of chunks) {
      allChunks.push({
        chunkId: `${manual.id}:${entry.pageNumber ?? 'na'}:${chunk.index}`,
        page: chunk.page,
        text: chunk.text,
      });
    }
  }

  const diagnostics = buildIndexDiagnostics({
    pages: pageEntries,
    chunks: allChunks,
    quality: extractionSummary?.quality,
    extractor: extractionSummary?.extractor || 'custom',
  });

  return {
    status: 'indexed',
    manualId: manual.id,
    title: manual.title || manual.originalName || 'Без названия',
    brand: manual.brand || '',
    model: manual.model || '',
    sourceSignature: buildManualSignature(manual),
    extractionMethod: diagnostics.extractionMethod,
    extractor: diagnostics.extractor,
    pagesCount: diagnostics.pagesCount,
    chunksCount: diagnostics.chunksCount,
    sampleTextPreview: diagnostics.sampleTextPreview,
    qualityScore: diagnostics.qualityScore,
    diagnostics,
    pages: pageEntries,
    chunks: allChunks,
    updatedAt: new Date().toISOString(),
    error: null,
  };
}

function buildFailedIndex(manual, errorMessage, diagnostics = null) {
  return {
    status: 'failed',
    manualId: manual.id,
    title: manual.title || manual.originalName || 'Без названия',
    brand: manual.brand || '',
    model: manual.model || '',
    sourceSignature: buildManualSignature(manual),
    extractionMethod: diagnostics?.extractionMethod || diagnostics?.extractor || null,
    extractor: diagnostics?.extractor || null,
    pagesCount: diagnostics?.pagesCount || 0,
    chunksCount: diagnostics?.chunksCount || 0,
    sampleTextPreview: diagnostics?.sampleTextPreview || '',
    qualityScore: diagnostics?.qualityScore ?? null,
    diagnostics,
    pages: [],
    chunks: [],
    updatedAt: new Date().toISOString(),
    error: sanitizeText(errorMessage, 400),
  };
}

function selectBestExtraction(candidates = []) {
  const usable = candidates.filter(candidate => candidate?.usable);
  if (!usable.length) return candidates.find(Boolean) || null;

  return usable.sort((a, b) => {
    const scoreDelta = (b.qualityScore || 0) - (a.qualityScore || 0);
    if (scoreDelta !== 0) return scoreDelta;
    const extractorPriority = candidate => (candidate?.extractor === 'pdfjs-dist' ? 4 : candidate?.extractor === 'pdf-parse' ? 3 : candidate?.extractor === 'custom-cmap-page-extractor' ? 2 : 1);
    const priorityDelta = extractorPriority(b) - extractorPriority(a);
    if (priorityDelta !== 0) return priorityDelta;
    const fontRatioDelta = (a.quality?.fontMetadataRatio || 0) - (b.quality?.fontMetadataRatio || 0);
    if (fontRatioDelta !== 0) return fontRatioDelta;
    const mojibakeDelta = (a.quality?.mojibakeRatio || 0) - (b.quality?.mojibakeRatio || 0);
    if (mojibakeDelta !== 0) return mojibakeDelta;
    const readableDelta = (b.quality?.meaningfulWordRatio || 0) - (a.quality?.meaningfulWordRatio || 0);
    if (readableDelta !== 0) return readableDelta;
    const qualityDelta = (b.quality?.uniqueTokens || 0) - (a.quality?.uniqueTokens || 0);
    if (qualityDelta !== 0) return qualityDelta;
    return (b.quality?.length || 0) - (a.quality?.length || 0);
  })[0];
}

function buildNonExtractableMessage(details = '') {
  const reason = sanitizeText(details || '', 200);
  return reason ? `${NON_EXTRACTABLE_PDF_ERROR}: ${reason}` : `${NON_EXTRACTABLE_PDF_ERROR}: ${NON_EXTRACTABLE_PDF_REASON}`;
}

export async function createManualIndex({ manual, pdfBuffer }) {
  const candidates = [];

  try {
    try {
      const pdfJsResult = await extractWithPdfJS(pdfBuffer);
      if (pdfJsResult) {
        candidates.push(summarizeExtraction({
          pageEntries: pdfJsResult.pageEntries,
          fullText: pdfJsResult.fullText,
          extractor: 'pdfjs-dist',
          meta: pdfJsResult.meta,
        }));
      }
    } catch {
      // fall back to pdf-parse below
    }

    const pdfJsCandidate = candidates[candidates.length - 1];
    const shouldTryPdfParseFallback = !pdfJsCandidate?.usable || !pdfJsCandidate?.pages?.length;

    if (shouldTryPdfParseFallback) {
      try {
        const parsed = await extractTextWithPdfParse(pdfBuffer);
        if (parsed) {
          candidates.push(summarizeExtraction({
            pageEntries: parsed.pageEntries,
            fullText: parsed.fullText,
            extractor: 'pdf-parse',
            meta: parsed.meta,
          }));
        }
      } catch {
        // handled by best-candidate validation below
      }
    }

    const best = selectBestExtraction(candidates);
    if (!best?.usable || !best.pages.length) {
      const diagnostics = buildIndexDiagnostics({
        pages: best?.pages || [],
        chunks: [],
        quality: best?.quality || analyzeTextQuality(''),
        extractor: best?.extractor || 'unknown',
      });
      const failed = buildFailedIndex(manual, buildNonExtractableMessage(NON_EXTRACTABLE_PDF_REASON), diagnostics);
      await saveManualIndex(failed);
      const error = new Error(failed.error);
      error.code = 'non_extractable_pdf';
      throw error;
    }

    const index = buildIndexDocument(manual, best.pages, best);
    if (!index.chunks.length || !index.sampleTextPreview || !isMeaningfulQuality(best.quality, { pageEntries: best.pages, meta: best.meta })) {
      const failed = buildFailedIndex(manual, buildNonExtractableMessage(NON_EXTRACTABLE_PDF_REASON), index.diagnostics);
      await saveManualIndex(failed);
      const error = new Error(failed.error);
      error.code = 'non_extractable_pdf';
      throw error;
    }

    await saveManualIndex(index);
    return index;
  } catch (error) {
    if (error.code === 'non_extractable_pdf') throw error;
    const best = selectBestExtraction(candidates);
    const diagnostics = best ? buildIndexDiagnostics({
      pages: best.pages,
      chunks: [],
      quality: best.quality,
      extractor: best.extractor,
    }) : null;
    const failed = buildFailedIndex(manual, error.message || 'index_failed', diagnostics);
    await saveManualIndex(failed);
    throw error;
  }
}

function countTokenMatches(chunkTokens, queryToken) {
  if (!queryToken) return 0;
  let count = 0;
  for (const token of chunkTokens) {
    if (token === queryToken) {
      count += 1;
      continue;
    }
    if (token.startsWith(queryToken) || queryToken.startsWith(token)) {
      count += 0.6;
      continue;
    }
    if (token.length >= 5 && queryToken.length >= 5 && (token.includes(queryToken) || queryToken.includes(token))) {
      count += 0.35;
    }
  }
  return count;
}

function isUsableChunk(chunk = {}) {
  if (!hasReadableLetters(chunk?.text || '')) return false;
  const quality = chunk?.quality || analyzeTextQuality(chunk?.text || '');
  if (isGarbageLikeText(chunk?.text || '')) return false;
  return isMeaningfulQuality(quality) || (
    quality.normalWordsCount >= 5
    && quality.fontMetadataHits === 0
    && quality.mojibakeHits === 0
    && quality.weirdRatio < 0.12
  );
}

function proximityBonus(text = '', terms = []) {
  const normalizedTerms = terms.filter(Boolean).map(term => normalizeText(term)).filter(Boolean);
  if (normalizedTerms.length < 2) return 0;

  const positions = normalizedTerms
    .map(term => ({ term, index: text.indexOf(term) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (positions.length < 2) return 0;

  let best = 0;
  for (let i = 0; i < positions.length - 1; i += 1) {
    const distance = positions[i + 1].index - positions[i].index;
    if (distance <= 40) best = Math.max(best, 4);
    else if (distance <= 90) best = Math.max(best, 2);
  }
  return best;
}

function getBrandModelTokens(manual = {}) {
  return tokenize([manual.brand, manual.model, manual.title].filter(Boolean).join(' '));
}

function technicalTokenBonus(tokens = [], chunkText = '') {
  let bonus = 0;
  for (const token of tokens) {
    if (!TECHNICAL_TERM_SET.has(token)) continue;
    if (chunkText.includes(token)) bonus += 4;
  }
  return bonus;
}

export function scoreChunks({ question, retrievalQuestion = '', manual, chunks }) {
  const originalQuestion = sanitizeText(question, 1200);
  const effectiveQuestion = sanitizeText(retrievalQuestion || question, 1200);
  const queryTokens = tokenize(effectiveQuestion);
  const originalTokens = tokenize(originalQuestion);
  const normalizedQuestion = normalizeText(effectiveQuestion);
  const exactPhrase = normalizedQuestion.length >= 8 ? normalizedQuestion : '';
  const brandTokens = getBrandModelTokens(manual);

  return (Array.isArray(chunks) ? chunks : []).filter(chunk => !isGarbageLikeText(chunk?.text || '')).map(chunk => {
    const chunkText = normalizeText(chunk.text);
    const chunkTokens = tokenize(chunk.text);
    const quality = analyzeTextQuality(chunk.text);
    let score = 0;
    let weakScore = 0;

    if (!quality.length || !hasReadableLetters(quality.text)) {
      return {
        ...chunk,
        manualId: manual.manualId || manual.id,
        title: manual.title,
        brand: manual.brand,
        model: manual.model,
        score: -1,
        weakScore: -1,
        quality,
      };
    }

    if (exactPhrase && chunkText.includes(exactPhrase)) {
      score += 12;
    }

    const compactQuestion = normalizedQuestion.replace(/\s+/g, ' ').trim();
    if (compactQuestion && compactQuestion.length >= 6 && chunkText.includes(compactQuestion)) {
      score += 8;
    }
    if (compactQuestion && compactQuestion.length >= 6) {
      const chunkCompact = chunkText.replace(/\s+/g, ' ').trim();
      if (chunkCompact === compactQuestion) {
        score += 14;
        weakScore += 3;
      } else if (chunkCompact.startsWith(compactQuestion) || chunkCompact.endsWith(compactQuestion)) {
        score += 6;
        weakScore += 1.5;
      }
    }

    for (const token of queryTokens) {
      const matches = countTokenMatches(chunkTokens, token);
      if (!matches) continue;
      score += token.length >= 6 ? matches * 3 : matches * 1.5;
      weakScore += matches;
    }

    for (const token of originalTokens) {
      if (token === normalizeText(token) && chunkText.includes(token)) {
        weakScore += 0.5;
      }
    }

    score += technicalTokenBonus(queryTokens, chunkText);
    weakScore += technicalTokenBonus(queryTokens, chunkText) * 0.3;

    const matchedBrandTokens = brandTokens.filter(token => token && chunkText.includes(token));
    if (matchedBrandTokens.length) {
      score += matchedBrandTokens.length * 2;
      weakScore += matchedBrandTokens.length * 1.2;
    }
    score += proximityBonus(chunkText, matchedBrandTokens.slice(0, 4));

    if (manual.brand && normalizeText(effectiveQuestion).includes(normalizeText(manual.brand)) && chunkText.includes(normalizeText(manual.brand))) {
      score += 3;
    }
    if (manual.model && normalizeText(effectiveQuestion).includes(normalizeText(manual.model)) && chunkText.includes(normalizeText(manual.model))) {
      score += 3;
    }

    weakScore += Math.min(quality.technicalHits, 4) * 0.8;
    weakScore += Math.min(quality.uniqueTokens / 20, 3);
    weakScore += Math.min(quality.wordsCount / 80, 2);

    return {
      ...chunk,
      manualId: manual.manualId || manual.id,
      title: manual.title,
      brand: manual.brand,
      model: manual.model,
      score: Number(score.toFixed(2)),
      weakScore: Number(weakScore.toFixed(2)),
      quality,
    };
  }).filter(chunk => chunk.score >= 0 || chunk.weakScore >= 0)
    .sort((a, b) => (b.score - a.score) || (b.weakScore - a.weakScore));
}

function buildGeminiPrompt(question, chunks) {
  const context = chunks.map((chunk, index) => {
    const pageLabel = chunk.page ? `page ${chunk.page}` : 'page unknown';
    return `[#${index + 1}] [${chunk.title} | ${pageLabel} | ${chunk.chunkId}]\n${chunk.text}`;
  }).join('\n\n');

  return `User question:\n${question}\nManual excerpts:\n${context}\n\nAnswer only from the excerpts. If the excerpts do not contain enough data, say: "${EMPTY_ANSWER}". Answer in the same language as the user's question. If the user asks several questions or requests extra tasks like translation, summarization, rewriting, or comparison, answer only the first documentation question and politely ask to send the rest as separate requests.`;
}

function compactSnippet(text = '', query = '') {
  const clean = cleanupExtractedText(text).slice(0, 500);
  if (!clean || !hasReadableLetters(clean)) return '';
  const tokens = tokenize(query);
  const hit = tokens.find(token => clean.toLowerCase().includes(token));
  if (!hit || clean.length <= 220) return clean.slice(0, 220);

  const index = clean.toLowerCase().indexOf(hit);
  const start = Math.max(0, index - 70);
  const end = Math.min(clean.length, index + 150);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

function extractGeminiText(json = {}) {
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.map(part => part?.text || '').join('\n').trim();
    if (text) return text;
  }
  return '';
}

async function callGemini({ systemText, userText, maxOutputTokens = 700, temperature = 0.1 }) {
  if (!GEMINI_API_KEY) {
    const error = new Error('Gemini API key is not configured');
    error.code = 'gemini_not_configured';
    throw error;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemText }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: userText }],
      }],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `Gemini request failed (${response.status})`;
    const error = new Error(message);
    error.code = 'gemini_failed';
    throw error;
  }

  return extractGeminiText(json);
}

export async function answerWithGemini({ question, chunks }) {
  const effectiveChunks = uniqueTopChunks((Array.isArray(chunks) ? chunks : []).filter(isUsableChunk), 5);
  if (!effectiveChunks.length) return EMPTY_ANSWER;

  const answer = await callGemini({
    systemText: 'Ты технический ассистент по PDF-мануалам кофейного оборудования. Отвечай только на основе переданных фрагментов. Не выдумывай характеристики, давления, температуры, порядок ремонта, коды ошибок и названия деталей. Если информации недостаточно, прямо скажи, что в найденных фрагментах нет достаточных данных. Сначала дай краткий полезный ответ, затем при необходимости коротко уточни ограничения ответа.',
    userText: buildGeminiPrompt(question, effectiveChunks),
    maxOutputTokens: 700,
    temperature: 0.1,
  });

  return sanitizeText(answer, 4000) || EMPTY_ANSWER;
}

export function buildSources(question, chunks, limit = 4) {
  return uniqueTopChunks((Array.isArray(chunks) ? chunks : []).filter(isUsableChunk), limit)
    .map(chunk => ({
      manualId: chunk.manualId,
      title: chunk.title,
      page: chunk.page ?? null,
      snippet: compactSnippet(chunk.text, question),
    }))
    .filter(source => source.snippet);
}

export function uniqueTopChunks(scoredChunks, limit = 6) {
  const selected = [];
  const seen = new Set();
  for (const chunk of scoredChunks || []) {
    if (!chunk?.chunkId || seen.has(chunk.chunkId)) continue;
    if (!isUsableChunk(chunk)) continue;
    selected.push(chunk);
    seen.add(chunk.chunkId);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function selectContentFallbackChunks(chunks, limit = 3) {
  const meaningful = (Array.isArray(chunks) ? chunks : [])
    .filter(isUsableChunk)
    .map(chunk => ({
      ...chunk,
      quality: chunk.quality || analyzeTextQuality(chunk.text),
    }))
    .filter(chunk => isMeaningfulQuality(chunk.quality) && !isGarbageLikeText(chunk.text))
    .sort((a, b) => {
      const aPage = Number.isFinite(a.page) ? a.page : Number.MAX_SAFE_INTEGER;
      const bPage = Number.isFinite(b.page) ? b.page : Number.MAX_SAFE_INTEGER;
      return aPage - bPage;
    });

  return uniqueTopChunks(meaningful, limit);
}
