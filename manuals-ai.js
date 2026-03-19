import path from 'path';
import fs from 'fs/promises';
import zlib from 'zlib';

const INDEX_DIR = path.join(path.resolve(), 'data', 'manual-index');
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
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

let pdfParseLoader = null;

function sanitizeText(value = '', max = 400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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

function cleanupExtractedText(text = '') {
  return sanitizeText(String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
    .replace(/[•·▪◦]+/g, ' • ')
    .replace(/[|¦]+/g, ' | ')
    .replace(/\s+/g, ' '), 120000);
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

function extractPageTexts(pdfBuffer) {
  const objectMap = parseObjectMap(pdfBuffer);
  const pages = [];

  for (const [, body] of objectMap) {
    if (!/\/Type\s*\/Page\b/.test(body)) continue;
    const refs = extractContentsRefs(body);
    const pageParts = [];

    for (const ref of refs) {
      const objectBody = objectMap.get(ref);
      if (!objectBody) continue;
      const streamText = parseStream(objectBody);
      if (!streamText) continue;
      const text = extractTextFromStreamContent(streamText);
      if (text) pageParts.push(text);
    }

    const pageText = joinTextFragments(pageParts);
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

async function loadPdfParse() {
  if (!pdfParseLoader) {
    pdfParseLoader = import('pdf-parse')
      .then(mod => mod.default || mod)
      .catch(() => null);
  }
  return pdfParseLoader;
}

async function extractWithPdfParse(pdfBuffer) {
  const pdfParse = await loadPdfParse();
  if (!pdfParse) return null;

  const pageEntries = [];
  let pageNumber = 1;
  const result = await pdfParse(pdfBuffer, {
    pagerender: async pageData => {
      const textContent = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const text = joinTextFragments(textContent.items.map(item => item?.str || ''));
      pageEntries.push({ pageNumber, text });
      pageNumber += 1;
      return text;
    },
  });

  if (pageEntries.some(entry => entry.text)) {
    return {
      extractor: 'pdf-parse',
      pages: pageEntries.filter(entry => entry.text),
      fullText: joinTextFragments(pageEntries.map(entry => entry.text)),
      meta: {
        info: result?.info || null,
        numpages: result?.numpages || pageEntries.length,
      },
    };
  }

  const text = joinTextFragments(result?.text || '');
  if (!text) return null;

  return {
    extractor: 'pdf-parse',
    pages: [{ pageNumber: null, text }],
    fullText: text,
    meta: {
      info: result?.info || null,
      numpages: result?.numpages || null,
    },
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
  return [manual.id, manual.fileId, manual.uploadedAt, manual.size, manual.originalName].map(item => String(item || '')).join('|');
}

function analyzeTextQuality(text = '') {
  const clean = cleanupExtractedText(text);
  const tokens = tokenize(clean);
  const words = clean.split(/\s+/).filter(Boolean);
  const lowerClean = clean.toLowerCase();
  const letters = (clean.match(/\p{L}/gu) || []).length;
  const digits = (clean.match(/\p{N}/gu) || []).length;
  const technicalHits = tokens.filter(token => TECHNICAL_TERM_SET.has(token)).length;
  const weird = (clean.match(/[^\p{L}\p{N}\s.,;:()\[\]#/%+\-°*"'!?=&]/gu) || []).length;
  const meaningfulWords = words.filter(word => /^[\p{L}]{4,}$/u.test(word));
  const shortWords = words.filter(word => /^[\p{L}]{1,2}$/u.test(word));
  const uppercaseLikeWords = words.filter(word => /^[A-Z]{2,}$/.test(word));
  const repeatedSymbolRuns = (clean.match(/([^\p{L}\p{N}\s])\1{2,}/gu) || []).length;
  const fontMetadataHits = FONT_METADATA_PATTERNS.reduce((count, pattern) => count + ((lowerClean.match(pattern) || []).length), 0);
  const alnumRatio = (letters + digits) / Math.max(clean.length, 1);
  const weirdRatio = weird / Math.max(clean.length, 1);
  const meaningfulWordRatio = meaningfulWords.length / Math.max(words.length, 1);
  const shortWordRatio = shortWords.length / Math.max(words.length, 1);
  const uppercaseWordRatio = uppercaseLikeWords.length / Math.max(words.length, 1);
  const fontMetadataRatio = fontMetadataHits / Math.max(words.length, 1);
  return {
    text: clean,
    length: clean.length,
    wordsCount: words.length,
    uniqueTokens: tokens.length,
    meaningfulWordsCount: meaningfulWords.length,
    lettersCount: letters,
    digitsCount: digits,
    technicalHits,
    alnumRatio,
    weirdRatio,
    meaningfulWordRatio,
    shortWordRatio,
    uppercaseWordRatio,
    repeatedSymbolRuns,
    fontMetadataHits,
    fontMetadataRatio,
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
  if (quality.meaningfulWordsCount < 8) return false;
  if (quality.meaningfulWordRatio < 0.38) return false;
  if (quality.shortWordRatio > 0.55) return false;
  if (quality.uppercaseWordRatio > 0.45 && quality.meaningfulWordsCount < 15) return false;
  if (quality.repeatedSymbolRuns > 6) return false;
  if (quality.fontMetadataHits >= 6 && quality.fontMetadataRatio > 0.04) return false;
  if (quality.fontMetadataHits >= Math.max(8, Math.floor(quality.wordsCount * 0.08))) return false;
  const nonEmptyPages = (Array.isArray(pageEntries) ? pageEntries : []).filter(entry => sanitizeText(entry?.text || '', 2000)).length;
  const declaredPages = Number(meta?.numpages || meta?.numPages || 0);
  if (declaredPages >= 3 && nonEmptyPages > 0 && nonEmptyPages <= Math.floor(declaredPages / 3) && quality.length < 1200) return false;
  if (!hasReadableLetters(quality.text)) return false;
  return true;
}

function summarizeExtraction({ pageEntries = [], fullText = '', extractor = 'custom', meta = null } = {}) {
  const filteredPages = pageEntries
    .map(entry => ({
      pageNumber: entry.pageNumber ?? null,
      text: cleanupExtractedText(entry.text),
    }))
    .filter(entry => entry.text);

  const joinedText = cleanupExtractedText(fullText || filteredPages.map(entry => entry.text).join(' '));
  const quality = analyzeTextQuality(joinedText);

  return {
    extractor,
    meta,
    pages: filteredPages,
    pagesCount: filteredPages.length,
    quality,
    usable: isMeaningfulQuality(quality, { pageEntries: filteredPages, meta }),
  };
}

function buildIndexDiagnostics({ pages, chunks, quality, extractor }) {
  return {
    extractor,
    pagesCount: Array.isArray(pages) ? pages.length : 0,
    chunksCount: Array.isArray(chunks) ? chunks.length : 0,
    sampleTextPreview: quality?.sampleTextPreview || '',
    quality: quality ? {
      length: quality.length,
      wordsCount: quality.wordsCount,
      uniqueTokens: quality.uniqueTokens,
      alnumRatio: Number(quality.alnumRatio.toFixed(3)),
      weirdRatio: Number(quality.weirdRatio.toFixed(3)),
      technicalHits: quality.technicalHits,
      meaningfulWordsCount: quality.meaningfulWordsCount,
      meaningfulWordRatio: Number(quality.meaningfulWordRatio.toFixed(3)),
      shortWordRatio: Number(quality.shortWordRatio.toFixed(3)),
      fontMetadataHits: quality.fontMetadataHits,
      fontMetadataRatio: Number(quality.fontMetadataRatio.toFixed(3)),
    } : null,
  };
}

export async function ensureIndexDir() {
  await fs.mkdir(INDEX_DIR, { recursive: true });
}

function manualIndexPath(manualId) {
  return path.join(INDEX_DIR, `${manualId}.json`);
}

export async function loadManualIndex(manualId) {
  try {
    const raw = await fs.readFile(manualIndexPath(manualId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveManualIndex(index) {
  await ensureIndexDir();
  await fs.writeFile(manualIndexPath(index.manualId), JSON.stringify(index, null, 2), 'utf8');
}

export async function removeManualIndex(manualId) {
  try {
    await fs.unlink(manualIndexPath(manualId));
  } catch {
    // ignore missing files
  }
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
    error: index.error || null,
  };
}

function buildIndexDocument(manual, pageEntries, extractionSummary) {
  const allChunks = [];
  for (const entry of pageEntries) {
    const chunks = chunkPageText(entry.text, entry.pageNumber);
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
    extractor: diagnostics.extractor,
    pagesCount: diagnostics.pagesCount,
    chunksCount: diagnostics.chunksCount,
    sampleTextPreview: diagnostics.sampleTextPreview,
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
    extractor: diagnostics?.extractor || null,
    pagesCount: diagnostics?.pagesCount || 0,
    chunksCount: diagnostics?.chunksCount || 0,
    sampleTextPreview: diagnostics?.sampleTextPreview || '',
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
    const extractorPriority = candidate => (candidate?.extractor === 'pdf-parse' ? 3 : candidate?.extractor === 'custom-page-extractor' ? 2 : 1);
    const priorityDelta = extractorPriority(b) - extractorPriority(a);
    if (priorityDelta !== 0) return priorityDelta;
    const fontRatioDelta = (a.quality?.fontMetadataRatio || 0) - (b.quality?.fontMetadataRatio || 0);
    if (fontRatioDelta !== 0) return fontRatioDelta;
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
    const customPages = extractPageTexts(pdfBuffer);
    candidates.push(summarizeExtraction({
      pageEntries: customPages,
      fullText: customPages.map(entry => entry.text).join(' '),
      extractor: 'custom-page-extractor',
    }));

    const pdfParseExtraction = await extractWithPdfParse(pdfBuffer).catch(() => null);
    if (pdfParseExtraction) {
      candidates.push(summarizeExtraction(pdfParseExtraction));
    }

    const fallbackText = fallbackExtractText(pdfBuffer);
    if (fallbackText) {
      candidates.push(summarizeExtraction({
        pageEntries: [{ pageNumber: null, text: fallbackText }],
        fullText: fallbackText,
        extractor: 'custom-stream-fallback',
      }));
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

  return (Array.isArray(chunks) ? chunks : []).map(chunk => {
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

function buildGeminiPrompt(question, retrievalQuestion, chunks) {
  const context = chunks.map((chunk, index) => {
    const pageLabel = chunk.page ? `page ${chunk.page}` : 'page unknown';
    return `[#${index + 1}] [${chunk.title} | ${pageLabel} | ${chunk.chunkId}]\n${chunk.text}`;
  }).join('\n\n');

  const retrievalLine = retrievalQuestion && retrievalQuestion !== question
    ? `\nSearch query used for retrieval (English):\n${retrievalQuestion}\n`
    : '';

  return `User question:\n${question}${retrievalLine}\nManual excerpts:\n${context}\n\nAnswer only from the excerpts. If the excerpts do not contain enough data, say: "${EMPTY_ANSWER}". Answer in the same language as the user's question.`;
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

export async function translateQuestionToEnglish(question) {
  const sanitized = sanitizeText(question, 1000);
  if (!sanitized || !hasCyrillic(sanitized)) return sanitized;
  if (!GEMINI_API_KEY) return sanitized;

  try {
    const translation = await callGemini({
      systemText: 'You translate technical questions about coffee equipment manuals into concise technical English for search. Preserve brands, models, error codes, settings names, units, and part names. Return only the English query.',
      userText: sanitized,
      maxOutputTokens: 120,
      temperature: 0,
    });

    const clean = sanitizeText(translation, 400);
    return clean || sanitized;
  } catch {
    return sanitized;
  }
}

export async function answerWithGemini({ question, retrievalQuestion = '', chunks }) {
  const effectiveChunks = uniqueTopChunks((Array.isArray(chunks) ? chunks : []).filter(chunk => hasReadableLetters(chunk?.text || '')), 5);
  if (!effectiveChunks.length) return EMPTY_ANSWER;

  const answer = await callGemini({
    systemText: 'Ты технический ассистент по PDF-мануалам кофейного оборудования. Отвечай только на основе переданных фрагментов. Не выдумывай характеристики, давления, температуры, порядок ремонта, коды ошибок и названия деталей. Если информации недостаточно, прямо скажи, что в найденных фрагментах нет достаточных данных. Сначала дай краткий полезный ответ, затем при необходимости коротко уточни ограничения ответа.',
    userText: buildGeminiPrompt(question, retrievalQuestion, effectiveChunks),
    maxOutputTokens: 700,
    temperature: 0.1,
  });

  return sanitizeText(answer, 4000) || EMPTY_ANSWER;
}

export function buildSources(question, chunks, limit = 4) {
  return uniqueTopChunks((Array.isArray(chunks) ? chunks : []).filter(chunk => hasReadableLetters(chunk?.text || '')), limit)
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
    if (!hasReadableLetters(chunk.text || '')) continue;
    selected.push(chunk);
    seen.add(chunk.chunkId);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function selectContentFallbackChunks(chunks, limit = 3) {
  const meaningful = (Array.isArray(chunks) ? chunks : [])
    .filter(chunk => hasReadableLetters(chunk?.text || ''))
    .map(chunk => ({
      ...chunk,
      quality: chunk.quality || analyzeTextQuality(chunk.text),
    }))
    .filter(chunk => isMeaningfulQuality(chunk.quality))
    .sort((a, b) => {
      const aPage = Number.isFinite(a.page) ? a.page : Number.MAX_SAFE_INTEGER;
      const bPage = Number.isFinite(b.page) ? b.page : Number.MAX_SAFE_INTEGER;
      return aPage - bPage;
    });

  return uniqueTopChunks(meaningful, limit);
}
