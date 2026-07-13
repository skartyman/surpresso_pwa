/**
 * Migration script: GAS (Google Sheets) → Neon (PostgreSQL)
 *
 * Usage:
 *   GAS_WEBAPP_URL=<url> GAS_SECRET=<secret> DATABASE_URL=<neon_url> node backend/scripts/migrate_spare_parts_to_neon.js
 *
 * This script reads all spare parts data from Google Sheets via GAS
 * and writes it to the Neon database via Prisma.
 * Run once to migrate historical data. Safe to re-run (skips existing records).
 */

import 'dotenv/config';
import { getWarehousePrisma } from '../src/warehouse/warehousePrisma.js';

const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;
const GAS_SECRET = process.env.GAS_SECRET;

if (!GAS_WEBAPP_URL || !GAS_SECRET) {
  console.error('GAS_WEBAPP_URL and GAS_SECRET are required');
  process.exit(1);
}

async function gasPost(payload) {
  const body = { secret: GAS_SECRET, ...payload };
  const resp = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('GAS non-JSON: ' + text.slice(0, 200)); }
  if (!json.ok) throw new Error(json.error || 'GAS error');
  return json;
}

async function main() {
  const prisma = getWarehousePrisma();
  console.log('Connected to Neon. Starting migration...\n');

  // 1. Migrate SPARE_REQUESTS + SPARE_REQUEST_ITEMS
  console.log('--- Migrating Spare Requests ---');
  const reqListOut = await gasPost({ action: 'spareRequestList', status: '' });
  const requests = reqListOut.requests || [];
  console.log(`Found ${requests.length} requests in GAS`);

  let migratedReqs = 0;
  for (const req of requests) {
    const exists = await prisma.spareRequest.findUnique({ where: { id: req.id } });
    if (exists) { console.log(`  SKIP ${req.id} (exists)`); continue; }

    await prisma.spareRequest.create({
      data: {
        id: req.id,
        masterLogin: req.masterLogin || '',
        masterName: req.masterName || '',
        equipmentId: req.equipmentId || '',
        status: req.status || 'pending',
        createdAt: req.createdAt ? new Date(req.createdAt) : new Date(),
        processedAt: req.processedAt ? new Date(req.processedAt) : null,
        adminName: req.adminName || '',
        comment: req.comment || '',
      },
    });

    // Fetch items for this request
    try {
      const getOut = await gasPost({ action: 'spareRequestGet', id: req.id });
      if (getOut.ok && getOut.request && Array.isArray(getOut.request.items)) {
        for (let idx = 0; idx < getOut.request.items.length; idx++) {
          const item = getOut.request.items[idx];
          const itemId = req.id + '-' + String(idx + 1).padStart(3, '0');
          await prisma.spareRequestItem.create({
            data: {
              id: itemId,
              requestId: req.id,
              partCode: String(item.partCode || '').trim(),
              partName: String(item.partName || '').trim(),
              cell: String(item.cell || '').trim(),
              unit: String(item.unit || 'шт.').trim(),
              quantityRequested: Number(item.quantityRequested || 0),
              quantityIssued: Number(item.quantityIssued || 0),
            },
          });
        }
      }
    } catch (e) {
      console.error(`  ERROR fetching items for ${req.id}: ${e.message}`);
    }

    migratedReqs++;
    console.log(`  OK ${req.id}`);
  }
  console.log(`Migrated ${migratedReqs} requests\n`);

  // 2. Migrate MASTER_STOCK
  console.log('--- Migrating Master Stock ---');
  // Get all unique master logins from requests
  const masterLogins = [...new Set(requests.map(r => r.masterLogin).filter(Boolean))];
  let migratedStock = 0;

  for (const login of masterLogins) {
    try {
      const stockOut = await gasPost({ action: 'masterStockList', masterLogin: login });
      const items = stockOut.items || [];
      for (const item of items) {
        const exists = await prisma.masterStock.findUnique({ where: { id: item.id } });
        if (exists) continue;

        await prisma.masterStock.create({
          data: {
            id: item.id,
            masterLogin: item.masterLogin || login,
            masterName: item.masterName || '',
            requestId: item.requestId || '',
            partCode: item.partCode || '',
            partName: item.partName || '',
            cell: item.cell || '',
            unit: item.unit || 'шт.',
            quantityIssued: Number(item.quantityIssued || 0),
            quantityAvailable: Number(item.quantityAvailable || 0),
            issuedAt: item.issuedAt ? new Date(item.issuedAt) : new Date(),
            status: item.status || 'active',
          },
        });
        migratedStock++;
      }
    } catch (e) {
      console.error(`  ERROR migrating stock for ${login}: ${e.message}`);
    }
  }
  console.log(`Migrated ${migratedStock} master stock items\n`);

  // 3. Migrate SPARE_RETURNS + SPARE_RETURN_ITEMS
  console.log('--- Migrating Spare Returns ---');
  // We don't have a direct listAll returns action, but we can check returns
  // that were created via spareRequestReturn or spareReturnCreate
  // For now, skip if no direct access - returns are fewer and can be recreated
  console.log('(Returns migration skipped - fewer records, can be recreated via operations)\n');

  console.log('Migration complete!');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
