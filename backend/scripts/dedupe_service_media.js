import 'dotenv/config';

import { createMiniAppRepositories } from '../src/infrastructure/repositories/createMiniAppRepositories.js';

function parseArgs(argv = []) {
  return {
    apply: argv.includes('--apply'),
  };
}

function compareMediaRows(a, b) {
  const aCase = a.serviceCaseId ? 1 : 0;
  const bCase = b.serviceCaseId ? 1 : 0;
  if (aCase !== bCase) return bCase - aCase;

  const aCaption = a.caption ? 1 : 0;
  const bCaption = b.caption ? 1 : 0;
  if (aCaption !== bCaption) return bCaption - aCaption;

  const aTime = new Date(a.createdAt || 0).getTime();
  const bTime = new Date(b.createdAt || 0).getTime();
  return aTime - bTime;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { storage, repositories } = await createMiniAppRepositories(process.env.DATABASE_URL);
  if (storage !== 'neon-postgres') {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = repositories.serviceOpsRepository.prisma;
  const rows = await prisma.serviceCaseMedia.findMany({
    select: {
      id: true,
      equipmentId: true,
      serviceCaseId: true,
      fileUrl: true,
      caption: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.equipmentId || ''}||${row.fileUrl || ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const keepIds = new Set();
  const deleteIds = [];

  for (const group of grouped.values()) {
    if (group.length === 1) {
      keepIds.add(group[0].id);
      continue;
    }

    const sorted = [...group].sort(compareMediaRows);
    const keep = sorted[0];
    keepIds.add(keep.id);
    for (const row of sorted.slice(1)) {
      deleteIds.push(row.id);
    }
  }

  if (args.apply && deleteIds.length) {
    const chunkSize = 200;
    for (let i = 0; i < deleteIds.length; i += chunkSize) {
      const chunk = deleteIds.slice(i, i + chunkSize);
      await prisma.serviceCaseMedia.deleteMany({
        where: { id: { in: chunk } },
      });
    }
  }

  console.log(JSON.stringify({
    totalRows: rows.length,
    keepRows: keepIds.size,
    deleteRows: deleteIds.length,
    mode: args.apply ? 'apply' : 'dry-run',
    completedAt: new Date().toISOString(),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('[dedupe_service_media] failed');
  console.error(error);
  process.exit(1);
});
