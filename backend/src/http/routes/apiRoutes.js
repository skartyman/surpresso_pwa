import express from 'express';
import multer from 'multer';
import { config } from '../../config/env.js';
import { telegramAuth } from '../middleware/telegramAuth.js';
import { createAuthController } from '../controllers/authController.js';
import { createEquipmentController } from '../controllers/equipmentController.js';
import { createServiceController } from '../controllers/serviceController.js';
import { createAdminAuthController } from '../controllers/adminAuthController.js';
import { createAdminController } from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/adminAuth.js';

export function createApiRouter(deps) {
  const router = express.Router();
  const upload = multer({ dest: config.mediaUploadPath });

  const authMiddleware = telegramAuth(deps.clientRepository);
  const authController = createAuthController();
  const equipmentController = createEquipmentController(deps.equipmentRepository);
  const serviceController = createServiceController(deps.serviceRepository);

  const adminAuthController = createAdminAuthController(deps.userRepository, deps.sessionManager);
  const adminController = createAdminController();
  const adminAuth = requireAuth(deps.userRepository, deps.sessionManager);

  router.post('/auth/login', adminAuthController.login);
  router.post('/auth/logout', adminAuthController.logout);
  router.get('/auth/me', adminAuth, adminAuthController.me);

  router.get('/admin/manager', adminAuth, requireRole(['manager']), adminController.managerScope);
  router.get('/admin/service', adminAuth, requireRole(['manager', 'service']), adminController.serviceScope);
  router.get('/admin/content', adminAuth, requireRole(['manager', 'seo']), adminController.seoScope);

  router.get('/v1/auth/me', authMiddleware, authController.me);
  router.get('/v1/equipment', authMiddleware, equipmentController.list);
  router.get('/v1/equipment/:id', authMiddleware, equipmentController.byId);

  router.get('/v1/service-requests', authMiddleware, serviceController.list);
  router.post('/v1/service-requests', authMiddleware, upload.array('media', 6), serviceController.create);
  router.get('/v1/service-requests/:id/status', authMiddleware, serviceController.status);
  router.post('/v1/service-requests/:id/status', authMiddleware, serviceController.updateStatus);

  return router;
}
