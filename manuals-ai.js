import path from 'path';
import fs from 'fs/promises';
import zlib from 'zlib';

const INDEX_DIR = path.join(path.resolve(), 'data', 'manual-index');
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const TECHNICAL_TERMS = [
  'pressure', 'pump', 'pompa', 'boiler', 'sensor', 'temperature', 'thermostat', 'valve', 'solenoid',
  'flowmeter', 'flow', 'level', 'water', 'steam', 'brew', 'group', 'heater', 'heating', 'error',
  'fault', 'code', 'voltage', 'wiring', 'connector', 'fuse', 'switch', 'relay', 'probe', 'drain',
  'pressurestat', 'pid', 'gasket', 'grinder', 'hopper', 'motor', 'rpm', 'filter', 'cartridge',
  'датчик', 'уровня', 'давление', 'помпы', 'насос', 'бойлер', 'температура', 'клапан', 'ошибка',
  'код', 'ремонт', 'схема', 'электро', 'контактор', 'предохранитель', 'манометр'
];

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

function extractTextFromStreamContent(content = '') {
  const pieces = [];
  const blocks = content.match(/BT[\s\S]*?ET/g) || [];

  for (const block of blocks) {
    const normalizedBlock = block.replace(/\r/g, '\n');
    const textOps = normalizedBlock.match(/\[(?:[^[\]]|\([^)]*\))*\]\s*TJ|\([^)]*\)\s*Tj|\([^)]*\)\s*'|\([^)]*\)\s*"/g) || [];
    for (const op of textOps) {
      const strings = extractLiteralStrings(op);
      if (strings.length) pieces.push(strings.join(' '));
    }
  }

  if (!pieces.length) {
    const allStrings = extractLiteralStrings(content);
    if (allStrings.length) pieces.push(allStrings.join(' '));
  }

  return sanitizeText(pieces.join(' '), 100000);
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

    pages.push(sanitizeText(pageParts.join(' '), 30000));
  }

  return pages.filter(Boolean).map((text, index) => ({ pageNumber: index + 1, text }));
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

  return sanitizeText(pieces.join(' '), 120000);
}

function chunkPageText(text = '', pageNumber = null, chunkSize = 1100, overlap = 180) {
  if (!text) return [];
  const source = sanitizeText(text, 50000);
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
    return { status: 'not_indexed', updatedAt: null, chunksCount: 0, error: null };
  }

  const isFresh = index.sourceSignature && index.sourceSignature === buildManualSignature(manual);
  const status = index.status === 'failed' ? 'failed' : isFresh ? 'indexed' : 'not_indexed';
  return {
    status,
    updatedAt: index.updatedAt || null,
    chunksCount: Array.isArray(index.chunks) ? index.chunks.length : 0,
    error: index.error || null,
  };
}

function buildIndexDocument(manual, pageEntries) {
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

  return {
    status: 'indexed',
    manualId: manual.id,
    title: manual.title || manual.originalName || 'Без названия',
    brand: manual.brand || '',
    model: manual.model || '',
    sourceSignature: buildManualSignature(manual),
    pages: pageEntries,
    chunks: allChunks,
    updatedAt: new Date().toISOString(),
    error: null,
  };
}

function buildFailedIndex(manual, errorMessage) {
  return {
    status: 'failed',
    manualId: manual.id,
    title: manual.title || manual.originalName || 'Без названия',
    brand: manual.brand || '',
    model: manual.model || '',
    sourceSignature: buildManualSignature(manual),
    pages: [],
    chunks: [],
    updatedAt: new Date().toISOString(),
    error: sanitizeText(errorMessage, 400),
  };
}

export async function createManualIndex({ manual, pdfBuffer }) {
  try {
    const pageEntries = extractPageTexts(pdfBuffer);
    let effectivePages = pageEntries;

    if (!effectivePages.length) {
      const fallbackText = fallbackExtractText(pdfBuffer);
      if (fallbackText) {
        effectivePages = [{ pageNumber: null, text: fallbackText }];
      }
    }

    if (!effectivePages.length) {
      const failed = buildFailedIndex(manual, 'Этот PDF пока нельзя проиндексировать автоматически');
      await saveManualIndex(failed);
      const error = new Error(failed.error);
      error.code = 'non_extractable_pdf';
      throw error;
    }

    const index = buildIndexDocument(manual, effectivePages);
    await saveManualIndex(index);
    return index;
  } catch (error) {
    if (error.code === 'non_extractable_pdf') throw error;
    const failed = buildFailedIndex(manual, error.message || 'index_failed');
    await saveManualIndex(failed);
    throw error;
  }
}

export function scoreChunks({ question, manual, chunks }) {
  const queryTokens = tokenize(question);
  const techTokens = queryTokens.filter(token => TECHNICAL_TERMS.includes(token));
  const brandTokens = tokenize([manual.brand, manual.model, manual.title].filter(Boolean).join(' '));

  return chunks.map(chunk => {
    const chunkText = normalizeText(chunk.text);
    let score = 0;

    for (const token of queryTokens) {
      if (chunkText.includes(token)) score += token.length > 5 ? 4 : 2;
    }

    for (const token of techTokens) {
      if (chunkText.includes(token)) score += 5;
    }

    for (const token of brandTokens) {
      if (token && normalizeText(question).includes(token) && chunkText.includes(token)) {
        score += 4;
      }
    }

    if (manual.brand && normalizeText(question).includes(normalizeText(manual.brand))) score += 3;
    if (manual.model && normalizeText(question).includes(normalizeText(manual.model))) score += 3;

    return {
      ...chunk,
      manualId: manual.manualId || manual.id,
      title: manual.title,
      brand: manual.brand,
      model: manual.model,
      score,
    };
  }).filter(chunk => chunk.score > 0).sort((a, b) => b.score - a.score);
}

function buildGeminiPrompt(question, chunks) {
  const context = chunks.map((chunk, index) => {
    const pageLabel = chunk.page ? `page ${chunk.page}` : 'page unknown';
    return `[#${index + 1}] [${chunk.title} | ${pageLabel} | ${chunk.chunkId}]\n${chunk.text}`;
  }).join('\n\n');

  return `Вопрос пользователя:\n${question}\n\nНайденные фрагменты:\n${context}\n\nСформируй ответ строго по найденным фрагментам. Если данных недостаточно, прямо так и скажи.`;
}

function compactSnippet(text = '', query = '') {
  const clean = sanitizeText(text, 500);
  if (!clean) return '';
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

export async function answerWithGemini({ question, chunks }) {
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
        parts: [{
          text: 'Ты технический ассистент по PDF-мануалам кофейного оборудования. Отвечай только на основе переданных фрагментов. Не выдумывай характеристики, давления, температуры, порядок ремонта, коды ошибок и названия деталей. Если информации недостаточно, прямо скажи, что в найденных фрагментах нет достаточных данных. Всегда опирайся только на источники. В ответе сначала дай краткий полезный ответ, затем перечисли использованные источники.'
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: buildGeminiPrompt(question, chunks) }],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 700,
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

export function buildSources(question, chunks) {
  return chunks.map(chunk => ({
    manualId: chunk.manualId,
    title: chunk.title,
    page: chunk.page ?? null,
    snippet: compactSnippet(chunk.text, question),
  }));
}

export function uniqueTopChunks(scoredChunks, limit = 6) {
  const selected = [];
  const seen = new Set();
  for (const chunk of scoredChunks) {
    if (seen.has(chunk.chunkId)) continue;
    selected.push(chunk);
    seen.add(chunk.chunkId);
    if (selected.length >= limit) break;
  }
  return selected;
}
