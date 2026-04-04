import express from 'express';
import { config } from '../config/env.js';
import { createMiniAppRepositories } from '../infrastructure/repositories/createMiniAppRepositories.js';
import { TelegramBotGateway } from '../infrastructure/telegram/botApi.js';
import { createServiceRequestNotifier } from '../infrastructure/telegram/serviceRequestNotifier.js';
import { createApiRouter } from '../http/routes/apiRoutes.js';
import { createWebhookRouter } from '../http/routes/webhookRoutes.js';
import { createSupportController } from '../http/controllers/supportController.js';
import { createAdminSessionManager } from '../http/middleware/adminAuth.js';

export async function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/media', express.static(config.mediaUploadPath));

  const { repositories: deps, storage } = await createMiniAppRepositories(config.databaseUrl);
  const botGateway = new TelegramBotGateway({ token: config.telegramBotToken });
  const supportController = createSupportController(botGateway);
  const serviceRequestNotifier = createServiceRequestNotifier(botGateway);
  const sessionManager = createAdminSessionManager(config.adminSessionSecret);

  app.get('/health', (_, res) => res.json({ ok: true, storage }));
  app.get('/proxy-drive/:fileId', async (req, res) => {
    try {
      const fileId = String(req.params.fileId || '').trim();
      if (!fileId) {
        return res.status(400).send('missing_file_id');
      }

      const driveUrl = `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
      const response = await fetch(driveUrl);
      if (!response.ok) {
        return res.status(response.status).send('drive_error');
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
    } catch {
      return res.status(500).send('proxy_error');
    }
  });

  app.use('/api', createApiRouter({ ...deps, serviceRequestNotifier, sessionManager }));
  app.use('/webhooks', createWebhookRouter(botGateway));
  app.post('/api/v1/support/notify', supportController.notify);

  return app;
}
