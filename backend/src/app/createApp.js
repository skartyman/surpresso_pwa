import express from 'express';
import { config } from '../config/env.js';
import { InMemoryClientRepository, InMemoryEquipmentRepository, InMemoryServiceRequestRepository } from '../infrastructure/repositories/inMemoryRepositories.js';
import { TelegramBotGateway } from '../infrastructure/telegram/botApi.js';
import { createApiRouter } from '../http/routes/apiRoutes.js';
import { createWebhookRouter } from '../http/routes/webhookRoutes.js';
import { createSupportController } from '../http/controllers/supportController.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/media', express.static(config.mediaUploadPath));

  const deps = {
    clientRepository: new InMemoryClientRepository(),
    equipmentRepository: new InMemoryEquipmentRepository(),
    serviceRepository: new InMemoryServiceRequestRepository(),
  };
  const botGateway = new TelegramBotGateway({ token: config.telegramBotToken });
  const supportController = createSupportController(botGateway);

  app.get('/health', (_, res) => res.json({ ok: true }));
  app.use('/api/v1', createApiRouter(deps));
  app.use('/webhooks', createWebhookRouter(botGateway));
  app.post('/api/v1/support/notify', supportController.notify);

  return app;
}
