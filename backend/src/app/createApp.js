import express from 'express';
import path from 'path';
import { Readable } from 'node:stream';
import { config } from '../config/env.js';
import { createMiniAppRepositories } from '../infrastructure/repositories/createMiniAppRepositories.js';
import { TelegramBotGateway } from '../infrastructure/telegram/botApi.js';
import { createServiceRequestNotifier } from '../infrastructure/telegram/serviceRequestNotifier.js';
import { ExecutiveNotifier } from '../infrastructure/telegram/executiveNotifier.js';
import { NotificationCenterService } from '../domain/notificationCenterService.js';
import { createApiRouter } from '../http/routes/apiRoutes.js';
import { createWebhookRouter } from '../http/routes/webhookRoutes.js';
import { createSupportController } from '../http/controllers/supportController.js';
import { createAdminSessionManager } from '../http/middleware/adminAuth.js';
import { createServiceRequestEventBus } from '../domain/serviceRequestEvents.js';

export async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  const uploadsRoot = path.resolve(process.cwd(), 'miniapp-telegram', 'uploads');
  app.use('/media', express.static(config.mediaUploadPath));

  const { repositories: deps, storage } = await createMiniAppRepositories(config.databaseUrl);
  const botGateway = new TelegramBotGateway({ token: config.telegramBotToken });
  const supportController = createSupportController(botGateway);
  const serviceRequestNotifier = createServiceRequestNotifier(botGateway);
  const executiveNotifier = new ExecutiveNotifier(botGateway, config);
  const notificationCenterService = new NotificationCenterService({
    serviceOpsRepository: deps.serviceOpsRepository,
    executiveNotifier,
  });
  const sessionManager = createAdminSessionManager(config.adminSessionSecret);
  const serviceRequestEvents = createServiceRequestEventBus();

  app.get('/health', async (_, res) => {
    let dbOk = false;
    let adminServiceModuleOk = Boolean(deps.serviceOpsRepository);
    try {
      if (storage === 'neon-postgres') {
        await deps.serviceOpsRepository.listServiceCases({});
        dbOk = true;
      } else {
        dbOk = true;
      }
    } catch {
      dbOk = false;
      adminServiceModuleOk = false;
    }
    res.json({ ok: true, storage, dbOk, adminServiceModuleOk });
  });
  app.get('/proxy-drive/:fileId', async (req, res) => {
    try {
      const fileId = String(req.params.fileId || '').trim();
      if (!fileId) {
        return res.status(400).send('missing_file_id');
      }

      const driveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      const headers = {};
      const rangeHeader = String(req.get('range') || '').trim();
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }

      const response = await fetch(driveUrl, { headers });
      if (!response.ok) {
        return res.status(response.status).send('drive_error');
      }

      res.status(response.status === 206 ? 206 : 200);
      res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      const contentLength = response.headers.get('content-length');
      const contentRange = response.headers.get('content-range');
      if (contentLength) res.set('Content-Length', contentLength);
      if (contentRange) res.set('Content-Range', contentRange);
      res.set('Accept-Ranges', 'bytes');
      res.set('Cache-Control', 'public, max-age=3600');
      if (!response.body) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return res.send(buffer);
      }
      Readable.fromWeb(response.body).pipe(res);
      return undefined;
    } catch {
      return res.status(500).send('proxy_error');
    }
  });

  app.use('/api', createApiRouter({ ...deps, botGateway, serviceRequestNotifier, serviceRequestEvents, executiveNotifier, notificationCenterService, sessionManager, uploadsRoot }));
  app.use('/webhooks', createWebhookRouter(botGateway));
  app.post('/api/v1/support/notify', supportController.notify);
  app.post('/api/telegram/support/notify', supportController.notify);

  return app;
}
