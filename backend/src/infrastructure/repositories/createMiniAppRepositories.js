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
import { seed } from '../seed/mockData.js';

async function ensureNeonSeed(prisma) {
  const usersCount = await prisma.user.count();
  if (usersCount > 0) {
    return;
  }

  for (const user of seed.users) {
    await prisma.user.create({ data: user });
  }

  for (const client of seed.clients) {
    await prisma.client.create({ data: client });
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

  for (const item of seed.serviceRequestAssignmentHistory || []) {
    await prisma.serviceRequestAssignmentHistory.create({ data: item });
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
      userRepository: new NeonUserRepository(prisma),
    },
  };
}
