import express from 'express';
import multer from 'multer';
import { config } from '../../config/env.js';
import { telegramAuth } from '../middleware/telegramAuth.js';
import { createAuthController } from '../controllers/authController.js';
import { createEquipmentController } from '../controllers/equipmentController.js';
import { createServiceController } from '../controllers/serviceController.js';

export function createApiRouter(deps) {
  const router = express.Router();
  const upload = multer({ dest: config.mediaUploadPath });
  const authMiddleware = telegramAuth(deps.clientRepository);
  const authController = createAuthController();
  const equipmentController = createEquipmentController(deps.equipmentRepository);
  const serviceController = createServiceController(deps.serviceRepository);

  router.get('/auth/me', authMiddleware, authController.me);
  router.get('/equipment', authMiddleware, equipmentController.list);
  router.get('/equipment/:id', authMiddleware, equipmentController.byId);

  router.get('/service-requests', authMiddleware, serviceController.list);
  router.post('/service-requests', authMiddleware, upload.array('media', 6), serviceController.create);
  router.get('/service-requests/:id/status', authMiddleware, serviceController.status);
  router.post('/service-requests/:id/status', authMiddleware, serviceController.updateStatus);

  return router;
}
