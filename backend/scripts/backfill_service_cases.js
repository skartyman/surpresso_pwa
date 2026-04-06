import 'dotenv/config';
import { createMiniAppRepositories } from '../src/infrastructure/repositories/createMiniAppRepositories.js';

const ACTIVE_STATUSES = ['accepted', 'in_progress', 'testing', 'ready'];

function inferIntakeType(equipment) {
  if (equipment.intakeType) return equipment.intakeType;
  if (equipment.ownerType === 'client') return 'client_repair';
  return 'after_rent';
}

function buildStatusSideEffects(status, updatedAt) {
  const now = updatedAt || new Date();
  const patch = {};

  if (status === 'in_progress') {
    patch.assignedAt = now;
  }
  if (status === 'testing') {
    patch.testingAt = now;
  }
  if (status === 'ready') {
    patch.readyAt = now;
  }

  return patch;
}

async function main() {
  const { storage, repositories } = await createMiniAppRepositories(process.env.DATABASE_URL);
  if (storage !== 'neon-postgres') {
    throw new Error('DATABASE_URL is required for backfill_service_cases.js');
  }

  prismaClient = repositories?.serviceOpsRepository?.prisma;
  if (!prismaClient) {
    throw new Error('Failed to resolve prisma client from mini app repositories');
  }

  const equipments = await prismaClient.equipment.findMany({
    where: {
      serviceStatus: {
        in: ACTIVE_STATUSES,
      },
    },
    select: {
      id: true,
      serviceStatus: true,
      intakeType: true,
      ownerType: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  let created = 0;
  let skipped = 0;
  let historyCreated = 0;

  for (const equipment of equipments) {
    const existing = await prismaClient.serviceCase.findFirst({
      where: { equipmentId: equipment.id, serviceStatus: { in: ACTIVE_STATUSES } },
      select: {
        id: true,
      },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const initialStatus = equipment.serviceStatus;
    const baseDate = equipment.updatedAt || equipment.createdAt || new Date();

    const serviceCase = await prismaClient.serviceCase.create({
      data: {
        equipmentId: equipment.id,
        intakeType: inferIntakeType(equipment),
        serviceStatus: initialStatus,
        createdAt: baseDate,
        updatedAt: baseDate,
        ...buildStatusSideEffects(initialStatus, baseDate),
      },
      select: {
        id: true,
      },
    });

    created += 1;

    await prismaClient.serviceStatusHistory.create({
      data: {
        id: `ssh-backfill-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        equipmentId: equipment.id,
        serviceCaseId: serviceCase.id,
        fromStatusRaw: null,
        toStatusRaw: initialStatus,
        fromServiceStatus: null,
        toServiceStatus: initialStatus,
        comment: 'Backfilled from Equipment.serviceStatus',
        actorLabel: 'backfill_service_cases.js',
        changedAt: baseDate,
      },
    });

    historyCreated += 1;
  }

  console.log(
    JSON.stringify(
      {
        totalActiveEquipment: equipments.length,
        createdServiceCases: created,
        skippedExisting: skipped,
        createdHistoryRows: historyCreated,
      },
      null,
      2,
    ),
  );
}

let prismaClient = null;

main()
  .catch((err) => {
    console.error('BACKFILL FAILED');
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prismaClient) {
      await prismaClient.$disconnect();
    }
  });
