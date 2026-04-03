import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seed } from '../src/infrastructure/seed/mockData.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  for (const user of seed.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        positionTitle: user.positionTitle,
        isActive: user.isActive,
      },
      create: user,
    });
  }

  for (const client of seed.clients) {
    await prisma.client.upsert({
      where: { id: client.id },
      update: {
        telegramUserId: client.telegramUserId,
        companyName: client.companyName,
        contactName: client.contactName,
        phone: client.phone,
        isActive: client.isActive,
      },
      create: client,
    });
  }

  for (const equipment of seed.equipment) {
    await prisma.equipment.upsert({
      where: { id: equipment.id },
      update: {
        clientId: equipment.clientId,
        type: equipment.type,
        brand: equipment.brand,
        model: equipment.model,
        serial: equipment.serial,
        internalNumber: equipment.internalNumber,
        status: equipment.status,
      },
      create: equipment,
    });
  }

  for (const request of seed.serviceRequests) {
    await prisma.serviceRequest.upsert({
      where: { id: request.id },
      update: {
        type: request.type,
        clientId: request.clientId,
        equipmentId: request.equipmentId,
        title: request.title,
        category: request.category,
        description: request.description,
        urgency: request.urgency,
        canOperateNow: request.canOperateNow,
        status: request.status,
        assignedDepartment: request.assignedDepartment,
        source: request.source,
        assignedToUserId: request.assignedToUserId,
      },
      create: {
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
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
