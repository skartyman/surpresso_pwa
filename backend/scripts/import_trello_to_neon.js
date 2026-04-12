import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { normalizeDatabaseUrl } from '../src/utils/databaseUrl.js';

const { PrismaClient } = prismaClientPkg;

const DEFAULT_CLIENT_ID = 'trello-import-client';
const DEFAULT_CLIENT_TELEGRAM_ID = 'trello-import';

const STATUS_BY_KEYWORD = [
  { match: ['закрит', 'closed', 'done', 'готово'], status: 'closed' },
  { match: ['рахунок', 'счет', 'invoice', 'виставити'], status: 'to_director' },
  { match: ['контроль', 'qc', 'перевір'], status: 'on_service_head_control' },
  { match: ['тест', 'test'], status: 'ready_for_qc' },
  { match: ['доопрац', 'доработ', 'перероб'], status: 'taken_in_work' },
  { match: ['в робот', 'в работе', 'repair', 'ремонт'], status: 'taken_in_work' },
  { match: ['виїзд', 'выезд', 'монтаж', 'демонтаж', 'заміна', 'замена'], status: 'assigned' },
  { match: ['нов', 'new', 'inbox', 'вхід'], status: 'new' },
];

function parseArgs(argv = []) {
  const args = {
    apply: false,
    json: '',
    boardId: process.env.TRELLO_BOARD_ID || '',
    listId: process.env.TRELLO_LIST_ID || '',
    includeArchived: false,
    createEquipment: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = String(argv[i + 1] || ''), i += 1;
    else if (arg === '--board-id') args.boardId = String(argv[i + 1] || ''), i += 1;
    else if (arg === '--list-id') args.listId = String(argv[i + 1] || ''), i += 1;
    else if (arg === '--include-archived') args.includeArchived = true;
    else if (arg === '--create-equipment') args.createEquipment = true;
    else if (arg === '--verbose') args.verbose = true;
  }

  return args;
}

function safeId(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function cardCreatedAt(card = {}) {
  const id = String(card.id || '');
  if (/^[0-9a-f]{8}/i.test(id)) {
    const ts = Number.parseInt(id.slice(0, 8), 16);
    if (Number.isFinite(ts) && ts > 0) return new Date(ts * 1000);
  }
  return card.dateLastActivity ? new Date(card.dateLastActivity) : new Date();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return normalizeText(value).toLowerCase();
}

function parseStatusMap() {
  if (!process.env.TRELLO_LIST_STATUS_MAP) return {};
  try {
    return JSON.parse(process.env.TRELLO_LIST_STATUS_MAP);
  } catch {
    console.warn('[trello-import] TRELLO_LIST_STATUS_MAP is not valid JSON, using keyword mapping');
    return {};
  }
}

function mapStatus(listName = '', customMap = {}) {
  const normalized = lower(listName);
  if (customMap[listName]) return customMap[listName];
  if (customMap[normalized]) return customMap[normalized];

  for (const row of STATUS_BY_KEYWORD) {
    if (row.match.some((keyword) => normalized.includes(keyword))) return row.status;
  }

  return 'new';
}

function mapUrgency(card = {}) {
  const labelText = (card.labels || []).map((label) => `${label.name || ''} ${label.color || ''}`).join(' ').toLowerCase();
  if (/(critical|крит|термін|сроч|urgent|red)/i.test(labelText)) return 'critical';
  if (/(high|важл|orange)/i.test(labelText)) return 'high';
  if (/(low|низ|green)/i.test(labelText)) return 'low';
  return 'normal';
}

function detectMediaType(attachment = {}) {
  const mime = lower(attachment.mimeType || '');
  const url = lower(attachment.url || attachment.edgeColor || attachment.name || '');
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return 'video';
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url)) return 'image';
  return 'document';
}

function attachmentPreviewUrl(attachment = {}) {
  const previews = Array.isArray(attachment.previews) ? attachment.previews : [];
  const best = [...previews].sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0];
  return best?.url || null;
}

function extractEquipmentToken(card = {}) {
  const text = `${card.name || ''}\n${card.desc || ''}`;
  const inventory = text.match(/(?:інв\.?|инв\.?|inv\.?|nr\.?|№|#)\s*[:.-]?\s*([A-ZА-ЯІЇЄҐ0-9][A-ZА-ЯІЇЄҐ0-9._/-]{2,})/i);
  if (inventory?.[1]) return inventory[1].trim();
  const longNumber = text.match(/\b\d{6,14}\b/);
  return longNumber?.[0] || '';
}

function parseEquipmentTitle(card = {}) {
  const title = normalizeText(card.name);
  const [brand = 'Trello', ...rest] = title.split(/\s+/);
  return {
    brand: brand || 'Trello',
    model: rest.join(' ').slice(0, 120) || title.slice(0, 120) || 'Imported equipment',
  };
}

function buildDescription({ card, listName, board }) {
  const labels = (card.labels || []).map((label) => label.name || label.color).filter(Boolean).join(', ');
  const checklists = (card.checklists || [])
    .flatMap((checklist) => (checklist.checkItems || []).map((item) => `${item.state === 'complete' ? '[x]' : '[ ]'} ${item.name}`))
    .join('\n');
  return [
    normalizeText(card.desc),
    '',
    '--- Trello import ---',
    `Board: ${board.name || board.id || ''}`,
    `List: ${listName || ''}`,
    `Card: ${card.shortUrl || card.url || card.id}`,
    labels ? `Labels: ${labels}` : '',
    card.due ? `Due: ${card.due}` : '',
    checklists ? `Checklist:\n${checklists}` : '',
  ].filter(Boolean).join('\n');
}

async function resolveBoardIdFromList({ key, token, listId }) {
  if (!listId) return '';
  const params = new URLSearchParams({ key, token, fields: 'idBoard,name' });
  const response = await fetch(`https://api.trello.com/1/lists/${encodeURIComponent(listId)}?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`trello_list_api_http_${response.status}:${text.slice(0, 200)}`);
  }
  const list = await response.json();
  return list.idBoard || '';
}

async function loadBoardFromApi(args) {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  const boardId = args.boardId || await resolveBoardIdFromList({ key, token, listId: args.listId });
  if (!key || !token || !boardId) {
    throw new Error('TRELLO_KEY, TRELLO_TOKEN and TRELLO_BOARD_ID/--board-id or TRELLO_LIST_ID/--list-id are required when --json is not used');
  }

  const params = new URLSearchParams({
    key,
    token,
    fields: 'name,url',
    lists: 'all',
    cards: 'all',
    card_fields: 'all',
    card_attachments: 'true',
    card_checklists: 'all',
    members: 'all',
  });
  const response = await fetch(`https://api.trello.com/1/boards/${encodeURIComponent(boardId)}?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`trello_api_http_${response.status}:${text.slice(0, 200)}`);
  }
  return response.json();
}

async function loadBoard(args) {
  if (args.json) {
    const absolutePath = path.isAbsolute(args.json) ? args.json : path.resolve(process.cwd(), args.json);
    return JSON.parse(await readFile(absolutePath, 'utf8'));
  }
  return loadBoardFromApi(args);
}

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
    }),
  });
}

async function ensureImportClient(prisma) {
  return prisma.client.upsert({
    where: { id: DEFAULT_CLIENT_ID },
    update: {
      companyName: 'Trello import',
      contactName: 'Trello',
      phone: '-',
      isActive: true,
    },
    create: {
      id: DEFAULT_CLIENT_ID,
      telegramUserId: DEFAULT_CLIENT_TELEGRAM_ID,
      companyName: 'Trello import',
      contactName: 'Trello',
      phone: '-',
      isActive: true,
    },
  });
}

async function findOrCreateEquipment(prisma, card, args) {
  const token = extractEquipmentToken(card);
  if (token) {
    const existing = await prisma.equipment.findFirst({
      where: {
        OR: [
          { id: token },
          { internalNumber: token },
          { serial: token },
        ],
      },
    });
    if (existing) return existing;
  }

  if (!args.createEquipment) return null;

  const parsed = parseEquipmentTitle(card);
  const id = `trello-eq-${safeId(card.id)}`;
  return prisma.equipment.upsert({
    where: { id },
    update: {
      brand: parsed.brand,
      model: parsed.model,
      currentStatusRaw: 'trello_import',
    },
    create: {
      id,
      type: 'service',
      brand: parsed.brand,
      model: parsed.model,
      name: card.name || parsed.model,
      serial: token || null,
      internalNumber: token || null,
      status: 'trello_import',
      ownerType: 'client',
      serviceStatus: 'accepted',
      currentStatusRaw: 'trello_import',
      clientName: 'Trello import',
      lastComment: card.shortUrl || card.url || null,
    },
  });
}

async function importCard({ prisma, card, listName, board, args, customStatusMap }) {
  const requestId = `trello-${safeId(card.id)}`;
  const status = mapStatus(listName, customStatusMap);
  const createdAt = cardCreatedAt(card);
  const updatedAt = card.dateLastActivity ? new Date(card.dateLastActivity) : createdAt;
  const equipment = await findOrCreateEquipment(prisma, card, args);
  const description = buildDescription({ card, listName, board });

  await prisma.serviceRequest.upsert({
    where: { id: requestId },
    update: {
      title: card.name || '',
      category: (card.labels || []).map((label) => label.name || label.color).filter(Boolean).join(', ') || 'trello',
      description,
      urgency: mapUrgency(card),
      status,
      source: `trello:${board.id || args.boardId || 'export'}`,
      equipmentId: equipment?.id || null,
      updatedAt,
    },
    create: {
      id: requestId,
      type: 'service_repair',
      clientId: DEFAULT_CLIENT_ID,
      equipmentId: equipment?.id || null,
      title: card.name || '',
      category: (card.labels || []).map((label) => label.name || label.color).filter(Boolean).join(', ') || 'trello',
      description,
      urgency: mapUrgency(card),
      canOperateNow: true,
      status,
      assignedDepartment: 'service',
      source: `trello:${board.id || args.boardId || 'export'}`,
      createdAt,
      updatedAt,
    },
  });

  await prisma.serviceRequestStatusHistory.upsert({
    where: { id: `trello-history-${safeId(card.id)}` },
    update: {
      nextStatus: status,
      comment: `Imported from Trello list: ${listName || '-'}`,
    },
    create: {
      id: `trello-history-${safeId(card.id)}`,
      serviceRequestId: requestId,
      previousStatus: 'trello',
      nextStatus: status,
      changedByRole: 'system',
      comment: `Imported from Trello list: ${listName || '-'}`,
      createdAt,
    },
  });

  for (const attachment of card.attachments || []) {
    const fileUrl = attachment.url || attachment.previewUrl || attachmentPreviewUrl(attachment);
    if (!fileUrl) continue;
    const mediaId = `trello-media-${safeId(attachment.id || `${card.id}-${fileUrl}`)}`;
    await prisma.serviceRequestMedia.upsert({
      where: { id: mediaId },
      update: {
        fileUrl,
        previewUrl: attachmentPreviewUrl(attachment),
        mimeType: attachment.mimeType || null,
        originalName: attachment.name || null,
        size: Number(attachment.bytes || 0),
      },
      create: {
        id: mediaId,
        serviceRequestId: requestId,
        type: detectMediaType(attachment),
        fileId: attachment.id || null,
        fileUrl,
        previewUrl: attachmentPreviewUrl(attachment),
        mimeType: attachment.mimeType || null,
        originalName: attachment.name || null,
        size: Number(attachment.bytes || 0),
        createdAt: attachment.date ? new Date(attachment.date) : createdAt,
      },
    });
  }

  return {
    id: requestId,
    title: card.name || '',
    listName,
    status,
    equipmentId: equipment?.id || null,
    mediaCount: (card.attachments || []).length,
  };
}

function summarizeCards(board, args, customStatusMap) {
  const listsById = new Map((board.lists || []).map((list) => [list.id, list]));
  const cards = (board.cards || []).filter((card) => args.includeArchived || !card.closed);
  const byStatus = new Map();

  for (const card of cards) {
    const listName = listsById.get(card.idList)?.name || '';
    const status = mapStatus(listName, customStatusMap);
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
  }

  return { cards, listsById, byStatus };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const customStatusMap = parseStatusMap();
  const board = await loadBoard(args);
  const { cards, listsById, byStatus } = summarizeCards(board, args, customStatusMap);

  console.log('[trello-import] board:', board.name || board.id || args.boardId || args.json || 'unknown');
  console.log('[trello-import] mode:', args.apply ? 'apply' : 'dry-run');
  console.log('[trello-import] cards:', cards.length);
  console.log('[trello-import] status plan:', Object.fromEntries(byStatus.entries()));

  if (!args.apply) {
    for (const card of cards.slice(0, 12)) {
      const listName = listsById.get(card.idList)?.name || '';
      console.log(`  - ${mapStatus(listName, customStatusMap)} | ${listName || '-'} | ${card.name}`);
    }
    console.log('[trello-import] dry-run only. Re-run with --apply to write to Neon.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for --apply');
  }

  const prisma = createPrisma();
  try {
    await ensureImportClient(prisma);
    const imported = [];
    for (const card of cards) {
      const listName = listsById.get(card.idList)?.name || '';
      imported.push(await importCard({ prisma, card, listName, board, args, customStatusMap }));
      if (args.verbose) console.log('[trello-import] imported', imported.at(-1));
    }
    console.log('[trello-import] imported/upserted:', imported.length);
    console.log('[trello-import] with equipment:', imported.filter((item) => item.equipmentId).length);
    console.log('[trello-import] media refs:', imported.reduce((sum, item) => sum + item.mediaCount, 0));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[trello-import] failed:', error);
  process.exit(1);
});
