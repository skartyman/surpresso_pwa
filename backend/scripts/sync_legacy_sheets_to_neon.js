import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createMiniAppRepositories } from '../src/infrastructure/repositories/createMiniAppRepositories.js';

const DEFAULT_SPREADSHEET_ID = process.env.LEGACY_SHEETS_ID || '19GhF5uxmZ8NpnBXIavL1pjulALJhdKpKCCAt0IKc3OI';
const DEFAULT_GIDS = {
  equipment: process.env.LEGACY_SHEETS_EQUIPMENT_GID || '1840737062',
  status: process.env.LEGACY_SHEETS_STATUS_GID || '925272215',
  photos: process.env.LEGACY_SHEETS_PHOTOS_GID || '1128395503',
};
const ACTIVE_SERVICE_STATUSES = new Set(['accepted', 'in_progress', 'testing', 'ready']);
const MULTIWORD_BRANDS = [
  'nuova simonelli',
  'la spaziale',
  'victoria arduino',
  'san marco',
  'de longhi',
];

function parseArgs(argv = []) {
  const flags = {
    source: 'sheets',
    apply: false,
    verbose: false,
    spreadsheetId: DEFAULT_SPREADSHEET_ID,
    gids: { ...DEFAULT_GIDS },
    files: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--apply') flags.apply = true;
    else if (arg === '--verbose') flags.verbose = true;
    else if (arg === '--source') flags.source = String(argv[i + 1] || 'sheets').trim().toLowerCase(), i += 1;
    else if (arg === '--spreadsheet-id') flags.spreadsheetId = String(argv[i + 1] || '').trim(), i += 1;
    else if (arg === '--equipment-gid') flags.gids.equipment = String(argv[i + 1] || '').trim(), i += 1;
    else if (arg === '--status-gid') flags.gids.status = String(argv[i + 1] || '').trim(), i += 1;
    else if (arg === '--photos-gid') flags.gids.photos = String(argv[i + 1] || '').trim(), i += 1;
    else if (arg === '--equipment-csv') flags.files.equipment = String(argv[i + 1] || '').trim(), i += 1;
    else if (arg === '--status-csv') flags.files.status = String(argv[i + 1] || '').trim(), i += 1;
    else if (arg === '--photos-csv') flags.files.photos = String(argv[i + 1] || '').trim(), i += 1;
  }

  if (flags.files.equipment || flags.files.status || flags.files.photos) {
    flags.source = 'files';
  }

  return flags;
}

function csvExportUrl(spreadsheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}&v=${Date.now()}`;
}

function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    if (ch === '\r') continue;
    value += ch;
  }

  row.push(value);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((item) => String(item || '').trim());
  return rows.slice(1).map((items) => {
    const out = {};
    headers.forEach((header, index) => {
      if (!header) return;
      out[header] = items[index] ?? '';
    });
    return out;
  });
}

async function loadCsvRows({ source, spreadsheetId, gids, files, verbose }) {
  const loadRemote = async (label, gid) => {
    const url = csvExportUrl(spreadsheetId, gid);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`failed_to_fetch_${label}_csv_http_${response.status}`);
    }
    const text = await response.text();
    if (verbose) {
      console.log(`[sync] fetched ${label} csv`, url, `bytes=${text.length}`);
    }
    return parseCsv(text);
  };

  const loadFile = async (filePath) => {
    if (!filePath) return [];
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const text = await readFile(absolutePath, 'utf8');
    return parseCsv(text);
  };

  if (source === 'files') {
    return {
      equipmentRows: await loadFile(files.equipment),
      statusRows: await loadFile(files.status),
      photoRows: await loadFile(files.photos),
    };
  }

  return {
    equipmentRows: await loadRemote('equipment', gids.equipment),
    statusRows: await loadRemote('status', gids.status),
    photoRows: await loadRemote('photos', gids.photos),
  };
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function key(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function parseBool(value) {
  const normalized = key(value);
  if (!normalized) return false;
  return ['true', '1', 'yes', 'y', 'да', 'так'].includes(normalized);
}

function parseLegacyDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;

  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = '0', min = '0', sec = '0'] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(sec));
}

function parseEquipmentType(typeRaw) {
  const normalized = key(typeRaw).replace(/_/g, '-');
  if (normalized.includes('grinder') || normalized.includes('кофемол')) return 'grinder';
  if (normalized.includes('auto')) return 'auto_coffee';
  if (normalized.includes('pro')) return 'pro_coffee';
  if (normalized.includes('filter')) return 'filter_system';
  return null;
}

function inferBrand(row = {}) {
  const source = cleanText(row.brand) || cleanText(row.model) || cleanText(row.name) || 'Unknown';
  const normalized = source.toLowerCase();
  const multiword = MULTIWORD_BRANDS.find((item) => normalized.startsWith(item));
  if (multiword) {
    return multiword
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return source.split(/\s+/).slice(0, 1).join(' ') || 'Unknown';
}

function parseOwnerType(raw) {
  const normalized = key(raw);
  if (!normalized) return null;
  if (['company', 'компания', 'компанія'].includes(normalized)) return 'company';
  return 'client';
}

function parseClientServiceType(row = {}) {
  if (row.isContract === undefined || row.isContract === null || String(row.isContract).trim() === '') return null;
  return parseBool(row.isContract) ? 'service_contract' : 'regular_client';
}

function normalizeLegacyStatus(raw) {
  const s = key(raw);
  if (!s) return {
    serviceStatus: null,
    commercialStatus: null,
    workshopStage: null,
    currentPlacement: null,
  };

  if (['прийнято на ремонт', 'принято на ремонт', 'приехало после аренды', 'приехало с подмены', 'новокупленные', 'new purchase'].includes(s)) {
    return { serviceStatus: 'accepted', commercialStatus: null, workshopStage: 'arrived_waiting', currentPlacement: 'workshop' };
  }
  if (['в роботі', 'в работе'].includes(s)) {
    return { serviceStatus: 'in_progress', commercialStatus: null, workshopStage: 'in_progress', currentPlacement: 'workshop' };
  }
  if (['тест', 'testing'].includes(s)) {
    return { serviceStatus: 'testing', commercialStatus: null, workshopStage: 'testing', currentPlacement: 'workshop' };
  }
  if (['готово', 'проведено'].includes(s)) {
    return { serviceStatus: s === 'проведено' ? 'processed' : 'ready', commercialStatus: null, workshopStage: 'ready', currentPlacement: 'workshop' };
  }
  if (['видано клієнту', 'выдано клиенту'].includes(s)) {
    return { serviceStatus: 'closed', commercialStatus: 'issued_to_client', workshopStage: null, currentPlacement: 'at_location' };
  }
  if (s === 'готово к аренде') {
    return { serviceStatus: 'closed', commercialStatus: 'ready_for_rent', workshopStage: 'ready', currentPlacement: 'workshop' };
  }
  if (s === 'уехало на аренду') {
    return { serviceStatus: 'closed', commercialStatus: 'out_on_rent', workshopStage: null, currentPlacement: 'on_rent' };
  }
  if (s === 'уехало на подмену') {
    return { serviceStatus: 'closed', commercialStatus: 'out_on_replacement', workshopStage: null, currentPlacement: 'on_replacement' };
  }
  if (s === 'готово к продаже') {
    return { serviceStatus: 'closed', commercialStatus: 'ready_for_sale', workshopStage: 'ready', currentPlacement: 'workshop' };
  }
  if (s === 'бронь к аренде') {
    return { serviceStatus: 'closed', commercialStatus: 'reserved_for_rent', workshopStage: null, currentPlacement: 'workshop' };
  }
  if (s === 'бронь к продаже') {
    return { serviceStatus: 'closed', commercialStatus: 'reserved_for_sale', workshopStage: null, currentPlacement: 'workshop' };
  }
  if (s === 'продано') {
    return { serviceStatus: 'closed', commercialStatus: 'sold', workshopStage: null, currentPlacement: 'sold' };
  }
  if (['закрыто', 'завершено'].includes(s)) {
    return { serviceStatus: 'closed', commercialStatus: null, workshopStage: null, currentPlacement: 'workshop' };
  }

  return { serviceStatus: null, commercialStatus: null, workshopStage: null, currentPlacement: null };
}

function inferIntakeType({ ownerType, currentStatusRaw }) {
  const normalized = key(currentStatusRaw);
  if (['приехало после аренды'].includes(normalized)) return 'after_rent';
  if (['приехало с подмены'].includes(normalized)) return 'after_replacement';
  if (['новокупленные', 'new purchase'].includes(normalized)) return 'new_purchase';
  if (ownerType === 'client') return 'client_repair';
  return 'manual_intake';
}

function stableId(prefix, parts = []) {
  const hash = createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 20);
  return `${prefix}-${hash}`;
}

function resolveLatestLegacyEvent(equipmentRow, rawEvents = []) {
  const currentRaw = cleanText(equipmentRow.status);
  const currentAt = parseLegacyDate(equipmentRow.updatedAt) || parseLegacyDate(equipmentRow.createdAt) || new Date();
  const lastEvent = rawEvents[rawEvents.length - 1] || null;
  const lastRaw = lastEvent ? cleanText(lastEvent.newStatus) : null;
  if (!currentRaw) return rawEvents;

  if (!lastEvent || key(lastRaw) !== key(currentRaw)) {
    return [
      ...rawEvents,
      {
        ts: currentAt,
        oldStatus: lastRaw,
        newStatus: currentRaw,
        comment: cleanText(equipmentRow.lastComment),
        actor: 'legacy_equipment_row',
        synthetic: true,
      },
    ];
  }

  return rawEvents;
}

function buildLegacyCasesForEquipment(equipmentRow, statusRows = []) {
  const equipmentId = normalizeId(equipmentRow.id);
  const baseCreatedAt = parseLegacyDate(equipmentRow.createdAt) || parseLegacyDate(equipmentRow.updatedAt) || new Date();
  const timeline = resolveLatestLegacyEvent(
    equipmentRow,
    (statusRows || [])
      .map((row) => ({
        ts: parseLegacyDate(row.ts) || baseCreatedAt,
        oldStatus: cleanText(row.oldStatus),
        newStatus: cleanText(row.newStatus),
        comment: cleanText(row.comment),
        actor: cleanText(row.actor),
      }))
      .sort((a, b) => a.ts.getTime() - b.ts.getTime()),
  );

  if (!timeline.length) {
    const current = normalizeLegacyStatus(equipmentRow.status);
    if (!current.serviceStatus && !current.commercialStatus) return [];
    return [{
      id: `legacy-sc-${equipmentId}-001`,
      index: 0,
      serviceStatus: current.serviceStatus || 'accepted',
      commercialStatusAfter: current.commercialStatus || null,
      intakeType: inferIntakeType({ ownerType: parseOwnerType(equipmentRow.owner), currentStatusRaw: equipmentRow.status }),
      acceptedAt: baseCreatedAt,
      assignedAt: current.serviceStatus === 'in_progress' ? baseCreatedAt : null,
      testingAt: current.serviceStatus === 'testing' ? baseCreatedAt : null,
      readyAt: current.serviceStatus === 'ready' ? baseCreatedAt : null,
      processedAt: current.serviceStatus === 'processed' ? baseCreatedAt : null,
      closedAt: ['closed', 'cancelled'].includes(current.serviceStatus || '') ? baseCreatedAt : null,
      createdAt: baseCreatedAt,
      updatedAt: parseLegacyDate(equipmentRow.updatedAt) || baseCreatedAt,
      problemDescription: cleanText(equipmentRow.lastComment),
      intakeComment: cleanText(equipmentRow.lastComment),
      closingComment: cleanText(equipmentRow.lastComment),
      ownerTypeSnapshot: parseOwnerType(equipmentRow.owner),
      clientServiceTypeSnapshot: parseClientServiceType(equipmentRow),
      clientNameSnapshot: cleanText(equipmentRow.clientName),
      clientPhoneSnapshot: cleanText(equipmentRow.clientPhone),
      clientLocationSnapshot: cleanText(equipmentRow.clientLocation),
      companyLocationSnapshot: cleanText(equipmentRow.companyLocation),
      modelSnapshot: cleanText(equipmentRow.model),
      serialNumberSnapshot: cleanText(equipmentRow.serial),
      internalNumberSnapshot: cleanText(equipmentRow.internalNumber),
      equipmentNameSnapshot: cleanText(equipmentRow.name),
      events: [],
    }];
  }

  const cases = [];
  let currentCase = null;

  for (const event of timeline) {
    const normalized = normalizeLegacyStatus(event.newStatus);
    if (!normalized.serviceStatus && !normalized.commercialStatus) continue;

    const shouldStartNewCase =
      !currentCase
      || (normalized.serviceStatus === 'accepted' && currentCase.closedAt)
      || (normalized.serviceStatus === 'accepted' && currentCase.serviceStatus === 'closed');

    if (shouldStartNewCase) {
      currentCase = {
        id: `legacy-sc-${equipmentId}-${String(cases.length + 1).padStart(3, '0')}`,
        index: cases.length,
        serviceStatus: normalized.serviceStatus || 'accepted',
        commercialStatusAfter: normalized.commercialStatus || null,
        intakeType: inferIntakeType({ ownerType: parseOwnerType(equipmentRow.owner), currentStatusRaw: event.newStatus }),
        acceptedAt: event.ts,
        assignedAt: null,
        testingAt: null,
        readyAt: null,
        processedAt: null,
        closedAt: null,
        createdAt: event.ts,
        updatedAt: event.ts,
        problemDescription: cleanText(equipmentRow.lastComment),
        intakeComment: event.comment || cleanText(equipmentRow.lastComment),
        closingComment: null,
        ownerTypeSnapshot: parseOwnerType(equipmentRow.owner),
        clientServiceTypeSnapshot: parseClientServiceType(equipmentRow),
        clientNameSnapshot: cleanText(equipmentRow.clientName),
        clientPhoneSnapshot: cleanText(equipmentRow.clientPhone),
        clientLocationSnapshot: cleanText(equipmentRow.clientLocation),
        companyLocationSnapshot: cleanText(equipmentRow.companyLocation),
        modelSnapshot: cleanText(equipmentRow.model),
        serialNumberSnapshot: cleanText(equipmentRow.serial),
        internalNumberSnapshot: cleanText(equipmentRow.internalNumber),
        equipmentNameSnapshot: cleanText(equipmentRow.name),
        events: [],
      };
      cases.push(currentCase);
    }

    currentCase.events.push({
      ...event,
      normalized,
      caseId: currentCase.id,
    });
    currentCase.updatedAt = event.ts;
    currentCase.serviceStatus = normalized.serviceStatus || currentCase.serviceStatus;
    if (normalized.commercialStatus) currentCase.commercialStatusAfter = normalized.commercialStatus;
    if (normalized.serviceStatus === 'in_progress' && !currentCase.assignedAt) currentCase.assignedAt = event.ts;
    if (normalized.serviceStatus === 'testing' && !currentCase.testingAt) currentCase.testingAt = event.ts;
    if (normalized.serviceStatus === 'ready' && !currentCase.readyAt) currentCase.readyAt = event.ts;
    if (normalized.serviceStatus === 'processed' && !currentCase.processedAt) currentCase.processedAt = event.ts;
    if (normalized.serviceStatus === 'closed') {
      currentCase.closedAt = event.ts;
      currentCase.closingComment = event.comment || currentCase.closingComment;
    }
  }

  return cases;
}

function buildHistoryRows(cases = [], equipmentId) {
  const serviceHistory = [];
  const commercialHistory = [];

  for (const item of cases) {
    item.events.forEach((event, index) => {
      const fromServiceStatus = normalizeLegacyStatus(event.oldStatus).serviceStatus;
      const fromCommercialStatus = normalizeLegacyStatus(event.oldStatus).commercialStatus;
      const eventKeyParts = [
        equipmentId,
        item.id,
        event.ts.toISOString(),
        event.oldStatus || '',
        event.newStatus || '',
        event.actor || '',
        event.comment || '',
        String(index),
      ];

      serviceHistory.push({
        id: stableId('legacy-ssh', eventKeyParts),
        equipmentId,
        serviceCaseId: item.id,
        fromStatusRaw: event.oldStatus || null,
        toStatusRaw: event.newStatus || '',
        fromServiceStatus: fromServiceStatus || null,
        toServiceStatus: event.normalized.serviceStatus || null,
        comment: event.comment || null,
        actorLabel: event.actor || null,
        changedAt: event.ts,
      });

      if (event.normalized.commercialStatus) {
        commercialHistory.push({
          id: stableId('legacy-csh', eventKeyParts),
          equipmentId,
          serviceCaseId: item.id,
          fromCommercialStatus: fromCommercialStatus || null,
          toCommercialStatus: event.normalized.commercialStatus,
          comment: event.comment || null,
          actorLabel: event.actor || null,
          changedAt: event.ts,
        });
      }
    });
  }

  return { serviceHistory, commercialHistory };
}

function pickCaseForMedia(mediaAt, cases = []) {
  return cases.find((item) => {
    const start = item.createdAt?.getTime?.() || 0;
    const end = item.closedAt?.getTime?.() || Number.MAX_SAFE_INTEGER;
    const ts = mediaAt?.getTime?.() || 0;
    return ts >= start && ts <= end;
  }) || cases[cases.length - 1] || null;
}

function buildMediaRows(equipmentId, photoRows = [], cases = []) {
  return (photoRows || [])
    .map((row) => {
      const createdAt = parseLegacyDate(row.ts) || new Date();
      const fileUrl = cleanText(row.fileUrl) || cleanText(row.url) || cleanText(row.imgUrl);
      if (!fileUrl) return null;
      const assignedCase = pickCaseForMedia(createdAt, cases);
      return {
        id: stableId('legacy-scm', [equipmentId, row.fileId || '', fileUrl, createdAt.toISOString()]),
        equipmentId,
        serviceCaseId: assignedCase?.id || null,
        kind: /\.(mp4|mov|avi|webm)$/i.test(fileUrl) ? 'video' : 'photo',
        filePath: cleanText(row.fileId) || fileUrl,
        fileUrl,
        mimeType: null,
        originalName: cleanText(row.fileId),
        fileSize: 0,
        caption: cleanText(row.caption),
        createdAt,
      };
    })
    .filter(Boolean);
}

function groupByEquipmentId(rows = [], idField = 'equipmentId') {
  const map = new Map();
  for (const row of rows) {
    const equipmentId = normalizeId(row[idField] || row.id);
    if (!equipmentId) continue;
    if (!map.has(equipmentId)) map.set(equipmentId, []);
    map.get(equipmentId).push(row);
  }
  return map;
}

function buildEquipmentPayload(row = {}, cases = []) {
  const current = normalizeLegacyStatus(row.status);
  const latestCase = cases[cases.length - 1] || null;
  const ownerType = parseOwnerType(row.owner);
  const brand = inferBrand(row);
  const model = cleanText(row.model);

  return {
    id: normalizeId(row.id),
    type: cleanText(row.type) || 'legacy',
    brand,
    name: cleanText(row.name),
    model,
    serial: cleanText(row.serial),
    internalNumber: cleanText(row.internalNumber),
    status: cleanText(row.status) || 'unknown',
    ownerType,
    clientServiceType: parseClientServiceType(row),
    equipmentType: parseEquipmentType(row.type),
    currentStatusRaw: cleanText(row.status),
    serviceStatus: latestCase?.serviceStatus || current.serviceStatus || null,
    commercialStatus: latestCase?.commercialStatusAfter || current.commercialStatus || null,
    currentPlacement: current.currentPlacement,
    workshopStage: current.workshopStage,
    clientName: cleanText(row.clientName),
    clientPhone: cleanText(row.clientPhone),
    clientLocation: cleanText(row.clientLocation),
    companyLocation: cleanText(row.companyLocation),
    lastComment: cleanText(row.lastComment),
    folderId: cleanText(row.folderId),
    folderUrl: cleanText(row.folderUrl),
    passportPdfId: cleanText(row.passportPdfId),
    passportPdfUrl: cleanText(row.passportPdfUrl),
    qrUrl: cleanText(row.qrUrl),
    createdAt: parseLegacyDate(row.createdAt) || new Date(),
    updatedAt: parseLegacyDate(row.updatedAt) || parseLegacyDate(row.createdAt) || new Date(),
  };
}

async function upsertEquipmentBundle(prisma, payload) {
  await prisma.equipment.upsert({
    where: { id: payload.equipment.id },
    update: payload.equipment,
    create: payload.equipment,
  });

  for (const serviceCase of payload.cases) {
    await prisma.serviceCase.upsert({
      where: { id: serviceCase.id },
      update: serviceCase,
      create: serviceCase,
    });
  }

  for (const row of payload.serviceHistory) {
    await prisma.serviceStatusHistory.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });
  }

  for (const row of payload.commercialHistory) {
    await prisma.commercialStatusHistory.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });
  }

  for (const row of payload.media) {
    await prisma.serviceCaseMedia.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let prisma = null;
  if (args.apply) {
    const { storage, repositories } = await createMiniAppRepositories(process.env.DATABASE_URL);
    if (storage !== 'neon-postgres') {
      throw new Error('DATABASE_URL is required for sheets sync --apply');
    }
    prisma = repositories?.serviceOpsRepository?.prisma;
    if (!prisma) throw new Error('Failed to resolve prisma client');
  }

  const { equipmentRows, statusRows, photoRows } = await loadCsvRows(args);
  const groupedStatus = groupByEquipmentId(statusRows, 'equipmentId');
  const groupedPhotos = groupByEquipmentId(photoRows, 'equipmentId');

  const summary = {
    source: args.source,
    apply: args.apply,
    spreadsheetId: args.source === 'sheets' ? args.spreadsheetId : null,
    equipmentRows: equipmentRows.length,
    statusRows: statusRows.length,
    photoRows: photoRows.length,
    syncedEquipment: 0,
    syncedServiceCases: 0,
    syncedServiceHistory: 0,
    syncedCommercialHistory: 0,
    syncedMedia: 0,
    warnings: [],
  };

  for (const row of equipmentRows) {
    const equipmentId = normalizeId(row.id);
    if (!equipmentId) continue;

    const cases = buildLegacyCasesForEquipment(row, groupedStatus.get(equipmentId) || []);
    const { serviceHistory, commercialHistory } = buildHistoryRows(cases, equipmentId);
    const media = buildMediaRows(equipmentId, groupedPhotos.get(equipmentId) || [], cases);
    const equipment = buildEquipmentPayload(row, cases);

    const bundle = {
      equipment,
      cases: cases.map((item) => ({
        id: item.id,
        equipmentId,
        serviceRequestId: null,
        intakeType: item.intakeType,
        serviceStatus: item.serviceStatus,
        commercialStatusAfter: item.commercialStatusAfter,
        priority: null,
        problemDescription: item.problemDescription,
        damageDescription: null,
        intakeComment: item.intakeComment,
        closingComment: item.closingComment,
        ownerTypeSnapshot: item.ownerTypeSnapshot,
        clientServiceTypeSnapshot: item.clientServiceTypeSnapshot,
        clientNameSnapshot: item.clientNameSnapshot,
        clientPhoneSnapshot: item.clientPhoneSnapshot,
        clientLocationSnapshot: item.clientLocationSnapshot,
        companyLocationSnapshot: item.companyLocationSnapshot,
        modelSnapshot: item.modelSnapshot,
        serialNumberSnapshot: item.serialNumberSnapshot,
        internalNumberSnapshot: item.internalNumberSnapshot,
        equipmentNameSnapshot: item.equipmentNameSnapshot,
        assignedToUserId: null,
        assignedByUserId: null,
        processedByUserId: null,
        invoiceNumber: null,
        invoiceStatus: null,
        acceptedAt: item.acceptedAt,
        assignedAt: item.assignedAt,
        testingAt: item.testingAt,
        readyAt: item.readyAt,
        processedAt: item.processedAt,
        closedAt: item.closedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      serviceHistory,
      commercialHistory,
      media,
    };

    if (!bundle.equipment.serviceStatus && !bundle.equipment.commercialStatus) {
      summary.warnings.push(`unmapped_status:${equipmentId}:${bundle.equipment.currentStatusRaw || 'empty'}`);
    }

    if (args.apply) {
      await upsertEquipmentBundle(prisma, bundle);
    }

    summary.syncedEquipment += 1;
    summary.syncedServiceCases += bundle.cases.length;
    summary.syncedServiceHistory += bundle.serviceHistory.length;
    summary.syncedCommercialHistory += bundle.commercialHistory.length;
    summary.syncedMedia += bundle.media.length;
  }

  console.log(JSON.stringify({
    ...summary,
    completedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[sync_legacy_sheets_to_neon] failed');
    console.error(error);
    process.exit(1);
  });
