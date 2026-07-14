import { getWarehousePrisma } from './warehousePrisma.js';
import crypto from 'crypto';

function p() {
  return getWarehousePrisma();
}

function generateId(prefix, count) {
  return prefix + String(count + 1).padStart(4, '0');
}

function stockId() {
  return 'MS-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// =========================
// MASTER STOCK
// =========================

export async function masterStockList(masterLogin) {
  if (!masterLogin) return { ok: false, error: 'no_masterLogin' };

  const items = await p().masterStock.findMany({
    where: {
      masterLogin,
      status: { not: 'returned' },
      quantityAvailable: { gt: 0 },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const requestIds = [...new Set(items.map(i => i.requestId).filter(Boolean))];
  const requests = requestIds.length
    ? await p().spareRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, equipmentId: true, comment: true } })
    : [];
  const reqMap = Object.fromEntries(requests.map(r => [r.id, r]));

  return {
    ok: true,
    items: items.map(item => {
      const req = reqMap[item.requestId] || {};
      return {
        id: item.id,
        masterLogin: item.masterLogin,
        masterName: item.masterName,
        requestId: item.requestId,
        equipmentId: req.equipmentId || '',
        requestComment: req.comment || '',
        partCode: item.partCode,
        partName: item.partName,
        cell: item.cell,
        unit: item.unit,
        quantityIssued: item.quantityIssued,
        quantityAvailable: item.quantityAvailable,
        issuedAt: item.issuedAt,
        status: item.status,
      };
    }),
  };
}

export async function masterStockDeduct(masterLogin, items) {
  if (!masterLogin) return { ok: false, error: 'no_masterLogin' };
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'no_items' };

  const dedMap = {};
  for (const ded of items) {
    const reqId = String(ded.requestId || '').trim();
    const code = String(ded.partCode || '').trim();
    const qty = Number(ded.quantity || 0);
    if (reqId && code && qty > 0) {
      const key = reqId + '|||' + code;
      dedMap[key] = (dedMap[key] || 0) + qty;
    }
  }
  if (!Object.keys(dedMap).length) return { ok: false, error: 'no_valid_items' };

  const matchingRows = await p().masterStock.findMany({
    where: { masterLogin, status: { not: 'returned' }, quantityAvailable: { gt: 0 } },
  });

  const updates = [];
  for (const row of matchingRows) {
    const key = row.requestId + '|||' + row.partCode;
    if (!dedMap[key]) continue;
    const toDeduct = Math.min(row.quantityAvailable, dedMap[key]);
    if (toDeduct <= 0) continue;
    const newAvail = row.quantityAvailable - toDeduct;
    updates.push(
      p().masterStock.update({
        where: { id: row.id },
        data: { quantityAvailable: newAvail, status: newAvail <= 0 ? 'returned' : 'partial' },
      })
    );
    dedMap[key] -= toDeduct;
  }

  if (updates.length) await p().$transaction(updates);
  return { ok: true };
}

export async function masterStockReturn({ masterLogin, masterName, items, equipmentId, adminName, comment }) {
  if (!masterLogin) return { ok: false, error: 'no_masterLogin' };
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'no_items' };

  const dedResult = await masterStockDeduct(masterLogin, items);
  if (!dedResult.ok) return dedResult;

  const returnCount = await p().spareReturn.count();
  const returnId = generateId('RR-', returnCount);
  const now = new Date();
  const firstReqId = items[0] ? String(items[0].requestId || '').trim() : '';

  // Validate sourceRequestId exists in SpareRequest, otherwise null
  let validSourceRequestId = null;
  if (firstReqId && !firstReqId.startsWith('admin-adjust-')) {
    const exists = await p().spareRequest.findUnique({ where: { id: firstReqId }, select: { id: true } });
    if (exists) validSourceRequestId = firstReqId;
  }

  await p().spareReturn.create({
    data: {
      id: returnId,
      sourceRequestId: validSourceRequestId,
      masterLogin,
      masterName: masterName || '',
      equipmentId: equipmentId || '',
      status: 'returned',
      createdAt: now,
      processedAt: now,
      adminName: adminName || '',
      comment: comment || 'Возврат со склада мастера',
      mode: 'master_stock_return',
    },
  });

  const returnItems = [];
  for (const item of items) {
    const qty = Number(item.quantity || 0);
    if (qty <= 0) continue;
    const itemId = returnId + '-' + String(returnItems.length + 1).padStart(3, '0');
    const ri = {
      partCode: String(item.partCode || '').trim(),
      partName: String(item.partName || '').trim(),
      cell: String(item.cell || '').trim(),
      unit: String(item.unit || 'шт.').trim(),
      quantityReturned: qty,
    };
    await p().spareReturnItem.create({ data: { id: itemId, returnId, sourceRequestId: validSourceRequestId, ...ri } });
    returnItems.push(ri);
  }

  return {
    ok: true,
    id: returnId,
    return: {
      id: returnId,
      sourceRequestId: validSourceRequestId,
      masterLogin,
      masterName: masterName || '',
      equipmentId: equipmentId || '',
      status: 'returned',
      createdAt: now,
      processedAt: now,
      adminName: adminName || '',
      comment: comment || '',
      mode: 'master_stock_return',
      items: returnItems,
    },
  };
}

// =========================
// SPARE REQUESTS
// =========================

export async function spareRequestCreate({ masterLogin, masterName, equipmentId, comment, items }) {
  if (!masterLogin) return { ok: false, error: 'no_masterLogin' };
  if (!masterName) return { ok: false, error: 'no_masterName' };
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'no_items' };

  const reqCount = await p().spareRequest.count();
  const reqId = generateId('SR-', reqCount);
  const now = new Date();

  await p().spareRequest.create({
    data: {
      id: reqId,
      masterLogin,
      masterName,
      equipmentId: equipmentId || '',
      status: 'pending',
      createdAt: now,
      comment: comment || '',
    },
  });

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemId = reqId + '-' + String(idx + 1).padStart(3, '0');
    const partCode = String(item.partCode || '').trim();
    const partName = String(item.partName || '').trim();
    const cell = String(item.cell || '').trim();
    await p().spareRequestItem.create({
      data: {
        id: itemId,
        requestId: reqId,
        partCode,
        partName,
        cell,
        unit: String(item.unit || 'шт.').trim(),
        quantityRequested: Number(item.quantityRequested || 1),
        quantityIssued: 0,
      },
    });
  }

  return { ok: true, id: reqId };
}

export async function spareRequestList(status) {
  const where = status ? { status } : {};
  const requests = await p().spareRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  return { ok: true, requests };
}

export async function spareRequestGet(id) {
  if (!id) return { ok: false, error: 'no_id' };
  const request = await p().spareRequest.findUnique({ where: { id }, include: { items: true } });
  if (!request) return { ok: false, error: 'not_found' };
  return { ok: true, request };
}

export async function spareRequestIssue(id, adminName, items) {
  if (!id) return { ok: false, error: 'no_id' };
  if (!adminName) return { ok: false, error: 'no_adminName' };

  const request = await p().spareRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: 'not_found' };

  const issueMap = {};
  (Array.isArray(items) ? items : []).forEach(item => {
    const key = String(item.itemId || item.partCode || '').trim();
    if (key) issueMap[key] = Number(item.quantityIssued || 0);
  });

  await p().spareRequest.update({
    where: { id },
    data: { status: 'issued', processedAt: new Date(), adminName },
  });

  const reqItems = await p().spareRequestItem.findMany({ where: { requestId: id } });
  const stockWrites = [];

  for (const item of reqItems) {
    const key = String(item.id || item.partCode || '');
    const qty = (issueMap[key] !== undefined) ? issueMap[key] : 0;
    await p().spareRequestItem.update({ where: { id: item.id }, data: { quantityIssued: qty } });

    if (qty > 0 && request.masterLogin) {
      stockWrites.push(
        p().masterStock.create({
          data: {
            id: stockId(),
            masterLogin: request.masterLogin,
            masterName: request.masterName,
            requestId: id,
            partCode: item.partCode,
            partName: item.partName,
            cell: item.cell,
            unit: item.unit,
            quantityIssued: qty,
            quantityAvailable: qty,
            issuedAt: new Date(),
            status: 'active',
          },
        })
      );
    }
  }

  if (stockWrites.length) await p().$transaction(stockWrites);
  return { ok: true };
}

export async function spareRequestReturn(id, adminName, comment, items) {
  if (!id) return { ok: false, error: 'no_id' };
  if (!adminName) return { ok: false, error: 'no_adminName' };

  const request = await p().spareRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: 'not_found' };
  if (request.status !== 'issued' && request.status !== 'returned') return { ok: false, error: 'not_issued' };

  const selected = Array.isArray(items) ? items : [];
  const byId = {};
  const byCode = {};
  selected.forEach(item => {
    const itemId = String(item.itemId || '').trim();
    const code = String(item.partCode || '').trim();
    const qty = Number(item.quantityReturned || 0);
    if (itemId) byId[itemId] = qty;
    else if (code) byCode[code] = qty;
  });

  const reqItems = await p().spareRequestItem.findMany({ where: { requestId: id } });
  const returnItems = [];
  const updates = [];

  for (const row of reqItems) {
    const wanted = byId[row.id] !== undefined ? byId[row.id] : (byCode[row.partCode] || 0);
    if (wanted <= 0) continue;
    const qty = Math.min(wanted, Math.max(0, row.quantityIssued || 0));
    if (qty <= 0) continue;
    returnItems.push({
      partCode: row.partCode, partName: row.partName, cell: row.cell, unit: row.unit, quantityReturned: qty,
    });
    updates.push(
      p().spareRequestItem.update({
        where: { id: row.id },
        data: { quantityIssued: Math.max(0, (row.quantityIssued || 0) - qty) },
      })
    );
  }

  if (updates.length) await p().$transaction(updates);

  if (!returnItems.length) {
    return { ok: false, error: 'no_items_to_return' };
  }

  const returnCount = await p().spareReturn.count();
  const returnId = generateId('RR-', returnCount);
  const now = new Date();

  await p().spareReturn.create({
    data: {
      id: returnId, sourceRequestId: id,
      masterLogin: request.masterLogin, masterName: request.masterName,
      equipmentId: request.equipmentId || '', status: 'returned',
      createdAt: now, processedAt: now, adminName,
      comment: comment || 'Возврат по заявке ' + id, mode: 'request_return',
    },
  });

  for (let idx = 0; idx < returnItems.length; idx++) {
    const ri = returnItems[idx];
    await p().spareReturnItem.create({
      data: { id: returnId + '-' + String(idx + 1).padStart(3, '0'), returnId, sourceRequestId: id, ...ri },
    });
  }

  await p().spareRequest.update({ where: { id }, data: { status: 'returned', processedAt: now, adminName } });

  return {
    ok: true, id: returnId,
    return: {
      id: returnId, sourceRequestId: id,
      masterLogin: request.masterLogin, masterName: request.masterName,
      equipmentId: request.equipmentId || '', status: 'returned',
      createdAt: now, processedAt: now, adminName, comment: comment || '',
      mode: 'request_return', items: returnItems,
    },
  };
}

export async function spareRequestCancelIssued(id, adminName, comment) {
  if (!id) return { ok: false, error: 'no_id' };
  if (!adminName) return { ok: false, error: 'no_adminName' };

  const request = await p().spareRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: 'not_found' };
  if (request.status !== 'issued' && request.status !== 'returned') return { ok: false, error: 'not_issued' };

  const reqItems = await p().spareRequestItem.findMany({ where: { requestId: id } });
  const returnItems = reqItems
    .filter(row => (row.quantityIssued || 0) > 0)
    .map(row => ({
      partCode: row.partCode, partName: row.partName, cell: row.cell, unit: row.unit,
      quantityReturned: row.quantityIssued || 0,
    }));

  const returnCount = await p().spareReturn.count();
  const returnId = generateId('RR-', returnCount);
  const now = new Date();

  await p().spareReturn.create({
    data: {
      id: returnId, sourceRequestId: id,
      masterLogin: request.masterLogin, masterName: request.masterName,
      equipmentId: request.equipmentId || '', status: 'returned',
      createdAt: now, processedAt: now, adminName,
      comment: comment || 'Отмена выдачи ' + id, mode: 'cancel_issued',
    },
  });

  for (let idx = 0; idx < returnItems.length; idx++) {
    const ri = returnItems[idx];
    await p().spareReturnItem.create({
      data: { id: returnId + '-' + String(idx + 1).padStart(3, '0'), returnId, sourceRequestId: id, ...ri },
    });
  }

  await p().spareRequest.update({ where: { id }, data: { status: 'cancelled', processedAt: now, adminName } });

  for (const row of reqItems) {
    if ((row.quantityIssued || 0) > 0) {
      await p().spareRequestItem.update({ where: { id: row.id }, data: { quantityIssued: 0 } });
    }
  }

  return {
    ok: true, id: returnId,
    return: {
      id: returnId, sourceRequestId: id,
      masterLogin: request.masterLogin, masterName: request.masterName,
      equipmentId: request.equipmentId || '', status: 'returned',
      createdAt: now, processedAt: now, adminName, comment: comment || '',
      mode: 'cancel_issued', items: returnItems,
    },
  };
}

export async function spareRequestAddItem(id, { partCode, partName, cell, unit, quantity }) {
  if (!id) return { ok: false, error: 'no_id' };
  if (!partCode && !partName) return { ok: false, error: 'no_part' };

  const request = await p().spareRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: 'request_not_found' };

  const existing = await p().spareRequestItem.findMany({
    where: { requestId: id },
    select: { id: true },
  });
  let maxNum = 0;
  for (const it of existing) {
    const suffix = it.id.replace(id + '-', '');
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  const itemId = id + '-' + String(maxNum + 1).padStart(3, '0');

  await p().spareRequestItem.create({
    data: {
      id: itemId, requestId: id,
      partCode: String(partCode || '').trim(),
      partName: String(partName || '').trim(),
      cell: String(cell || '').trim(),
      unit: String(unit || 'шт.').trim(),
      quantityRequested: Number(quantity) || 1,
      quantityIssued: 0,
    },
  });

  return { ok: true, itemId };
}

export async function spareRequestRemoveItem(requestId, itemId) {
  if (!requestId) return { ok: false, error: 'no_requestId' };
  if (!itemId) return { ok: false, error: 'no_itemId' };

  const item = await p().spareRequestItem.findUnique({ where: { id: itemId } });
  if (!item || item.requestId !== requestId) return { ok: false, error: 'item_not_found' };

  await p().spareRequestItem.delete({ where: { id: itemId } });
  return { ok: true };
}

// =========================
// SPARE RETURN
// =========================

export async function spareReturnCreate({ masterLogin, masterName, equipmentId, sourceRequestId, comment, items, adminName, mode }) {
  if (!masterLogin && !masterName) return { ok: false, error: 'no_master' };
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'no_items' };

  const filteredItems = items
    .map(item => ({
      partCode: String(item.partCode || '').trim(),
      partName: String(item.partName || '').trim(),
      cell: String(item.cell || '').trim(),
      unit: String(item.unit || 'шт.').trim(),
      quantityReturned: Number(item.quantityReturned || 0),
    }))
    .filter(item => item.quantityReturned > 0 && (item.partCode || item.partName));

  if (!filteredItems.length) return { ok: false, error: 'no_valid_items' };

  const returnCount = await p().spareReturn.count();
  const returnId = generateId('RR-', returnCount);
  const now = new Date();

  await p().spareReturn.create({
    data: {
      id: returnId,
      sourceRequestId: sourceRequestId || null,
      masterLogin: masterLogin || '',
      masterName: masterName || '',
      equipmentId: equipmentId || '',
      status: 'returned',
      createdAt: now,
      processedAt: now,
      adminName: adminName || masterName || '',
      comment: comment || '',
      mode: mode || 'manual',
    },
  });

  for (let idx = 0; idx < filteredItems.length; idx++) {
    const ri = filteredItems[idx];
    await p().spareReturnItem.create({
      data: { id: returnId + '-' + String(idx + 1).padStart(3, '0'), returnId, sourceRequestId: sourceRequestId || null, ...ri },
    });
  }

  return {
    ok: true,
    id: returnId,
    return: {
      id: returnId,
      sourceRequestId: sourceRequestId || '',
      masterLogin: masterLogin || '',
      masterName: masterName || '',
      equipmentId: equipmentId || '',
      status: 'returned',
      createdAt: now,
      processedAt: now,
      adminName: adminName || masterName || '',
      comment: comment || '',
      mode: mode || 'manual',
      items: filteredItems,
    },
  };
}
