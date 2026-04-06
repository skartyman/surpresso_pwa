import {
  InMemoryClientRepository,
  InMemoryEquipmentRepository,
  InMemoryServiceRequestRepository,
  InMemoryUserRepository,
} from './inMemoryRepositories.js';
import {
  NeonClientRepository,
  NeonEquipmentRepository,
  NeonServiceRequestRepository,
  NeonUserRepository,
} from './neonRepositories.js';
import { InMemoryServiceOpsRepository, NeonServiceOpsRepository } from './serviceOpsRepository.js';
import { seed } from '../seed/mockData.js';

async function ensureNeonSeed(prisma) {
  const usersCount = await prisma.user.count();
  if (usersCount > 0) {
    return;
  }

  for (const user of seed.users) {
    await prisma.user.create({ data: user });
  }

  for (const specialization of seed.userSpecializations || []) {
    await prisma.userSpecialization.create({ data: specialization });
  }

  for (const brand of seed.userBrandSkills || []) {
    await prisma.userBrandSkill.create({ data: brand });
  }

  for (const zone of seed.userZones || []) {
    await prisma.userZone.create({ data: zone });
  }


  for (const client of seed.clients) {
    await prisma.client.create({ data: client });
  }

  for (const network of (seed.networks || [])) {
    await prisma.network.create({ data: network });
  }

  for (const location of (seed.locations || [])) {
    await prisma.location.create({ data: location });
  }

  for (const pointUser of (seed.pointUsers || [])) {
    await prisma.pointUser.create({ data: pointUser });
  }

  for (const equipment of seed.equipment) {
    await prisma.equipment.create({ data: equipment });
  }

  for (const request of seed.serviceRequests) {
    await prisma.serviceRequest.create({
      data: {
        ...request,
        media: {
          create: (request.media || []).map((media) => ({
            id: media.id,
            type: media.type,
            fileId: media.fileId || null,
            fileUrl: media.fileUrl || media.url || '',
            previewUrl: media.previewUrl || media.imgUrl || null,
            mimeType: media.mimeType || null,
            originalName: media.originalName || null,
            size: Number(media.size || 0),
          })),
        },
      },
    });
  }

  for (const row of (seed.serviceRequestAssignmentHistory || [])) {
    await prisma.serviceRequestAssignmentHistory.create({ data: row });
  }
}

export async function createMiniAppRepositories(databaseUrl) {
  const hasDatabase = Boolean(databaseUrl);

  if (!hasDatabase) {
    return {
      storage: 'in-memory',
      repositories: {
        clientRepository: new InMemoryClientRepository(),
        equipmentRepository: new InMemoryEquipmentRepository(),
        serviceRepository: new InMemoryServiceRequestRepository(),
        serviceOpsRepository: new InMemoryServiceOpsRepository(),
        userRepository: new InMemoryUserRepository(),
      },
    };
  }

  const { getPrismaClient } = await import('../db/prismaClient.js');
  const prisma = getPrismaClient();
  await ensureNeonSeed(prisma);

  return {
    storage: 'neon-postgres',
    repositories: {
      clientRepository: new NeonClientRepository(prisma),
      equipmentRepository: new NeonEquipmentRepository(prisma),
      serviceRepository: new NeonServiceRequestRepository(prisma),
      serviceOpsRepository: new NeonServiceOpsRepository(prisma),
      userRepository: new NeonUserRepository(prisma),
    },
  };
}
