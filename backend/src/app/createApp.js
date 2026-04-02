import express from 'express';
import { config } from '../config/env.js';
import { InMemoryClientRepository, InMemoryEquipmentRepository, InMemoryServiceRequestRepository, InMemoryUserRepository } from '../infrastructure/repositories/inMemoryRepositories.js';
import { TelegramBotGateway } from '../infrastructure/telegram/botApi.js';
import { createApiRouter } from '../http/routes/apiRoutes.js';
import { createWebhookRouter } from '../http/routes/webhookRoutes.js';
import { createSupportController } from '../http/controllers/supportController.js';
import { createAdminSessionManager } from '../http/middleware/adminAuth.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/media', express.static(config.mediaUploadPath));

  const deps = {
    clientRepository: new InMemoryClientRepository(),
    equipmentRepository: new InMemoryEquipmentRepository(),
    serviceRepository: new InMemoryServiceRequestRepository(),
    userRepository: new InMemoryUserRepository(),
  };
  const botGateway = new TelegramBotGateway({ token: config.telegramBotToken });
  const supportController = createSupportController(botGateway);

  app.get('/health', (_, res) => res.json({ ok: true }));
  deps.sessionManager = createAdminSessionManager(config.adminSessionSecret);

  app.use('/api', createApiRouter(deps));
  app.use('/webhooks', createWebhookRouter(botGateway));
  app.post('/api/v1/support/notify', supportController.notify);

  return app;
}
