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
