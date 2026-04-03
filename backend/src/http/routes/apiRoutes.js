import express from 'express';
import multer from 'multer';
import { config } from '../../config/env.js';
import { telegramAuth } from '../middleware/telegramAuth.js';
import { createAuthController } from '../controllers/authController.js';
import { createEquipmentController } from '../controllers/equipmentController.js';
import { createServiceController } from '../controllers/serviceController.js';
import { createAdminAuthController } from '../controllers/adminAuthController.js';
import { createAdminController } from '../controllers/adminController.js';
import { createAdminServiceController } from '../controllers/adminServiceController.js';
import { createAdminEmployeesController } from '../controllers/adminEmployeesController.js';
import { createAdminCommunicationsController } from '../controllers/adminCommunicationsController.js';
import { createAdminAnalyticsController } from '../controllers/adminAnalyticsController.js';
import { requireAuth, requireRole } from '../middleware/adminAuth.js';

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const ROLES = {
  serviceEngineer: 'service_engineer',
  serviceHead: 'service_head',
  salesManager: 'sales_manager',
  owner: 'owner',
  director: 'director',
};

const ADMIN_ROLES = Object.values(ROLES);

export function createApiRouter(deps) {
  const router = express.Router();
  const upload = multer({ dest: config.mediaUploadPath });

  const authMiddleware = telegramAuth(deps.clientRepository);
  const authController = createAuthController();
  const equipmentController = createEquipmentController(deps.equipmentRepository);
  const serviceController = createServiceController(deps.serviceRepository, deps.equipmentRepository, deps.serviceRequestNotifier, deps.userRepository);

  const adminAuthController = createAdminAuthController(deps.userRepository, deps.sessionManager);
  const adminController = createAdminController();
  const adminServiceController = createAdminServiceController(deps.serviceRepository);
  const adminEmployeesController = createAdminEmployeesController(deps.userRepository);
  const adminCommunicationsController = createAdminCommunicationsController();
  const adminAnalyticsController = createAdminAnalyticsController(deps.serviceRepository, deps.userRepository);
  const adminAuth = requireAuth(deps.userRepository, deps.sessionManager);

  router.post('/auth/login', asyncHandler(adminAuthController.login));
  router.post('/auth/logout', adminAuthController.logout);
  router.get('/auth/me', asyncHandler(adminAuth), adminAuthController.me);

  router.get('/admin/scope', asyncHandler(adminAuth), requireRole(ADMIN_ROLES), adminController.scope);

  router.get('/admin/service-requests', asyncHandler(adminAuth), requireRole([ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.list));
  router.get('/admin/service-requests/:id', asyncHandler(adminAuth), requireRole([ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.byId));
  router.post('/admin/service-requests/:id/status', asyncHandler(adminAuth), requireRole([ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.updateStatus));
  router.post('/admin/service-requests/:id/assign', asyncHandler(adminAuth), requireRole([ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.assign));
  router.get('/admin/service-requests/:id/history', asyncHandler(adminAuth), requireRole([ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.history));
  router.get('/admin/service-requests/:id/notes', asyncHandler(adminAuth), requireRole([ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.notes));
  router.post('/admin/service-requests/:id/notes', asyncHandler(adminAuth), requireRole([ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director]), asyncHandler(adminServiceController.addNote));

  router.get('/admin/employees', asyncHandler(adminAuth), requireRole([ROLES.owner, ROLES.director, ROLES.serviceHead]), asyncHandler(adminEmployeesController.list));
  router.post('/admin/employees', asyncHandler(adminAuth), requireRole([ROLES.owner, ROLES.director]), asyncHandler(adminEmployeesController.create));
  router.patch('/admin/employees/:id', asyncHandler(adminAuth), requireRole([ROLES.owner, ROLES.director]), asyncHandler(adminEmployeesController.update));
  router.post('/admin/employees/:id/active', asyncHandler(adminAuth), requireRole([ROLES.owner, ROLES.director]), asyncHandler(adminEmployeesController.setActive));
  router.post('/admin/employees/:id/reset-password', asyncHandler(adminAuth), requireRole([ROLES.owner, ROLES.director]), asyncHandler(adminEmployeesController.resetPassword));

  router.get('/admin/communications/templates', asyncHandler(adminAuth), requireRole([ROLES.salesManager, ROLES.owner, ROLES.director]), adminCommunicationsController.templates);
  router.post('/admin/communications/broadcast', asyncHandler(adminAuth), requireRole([ROLES.salesManager, ROLES.owner, ROLES.director]), adminCommunicationsController.broadcast);

  router.get('/admin/analytics/summary', asyncHandler(adminAuth), requireRole([ROLES.owner, ROLES.director]), asyncHandler(adminAnalyticsController.summary));

  router.get('/v1/auth/me', asyncHandler(authMiddleware), authController.me);
  router.get('/v1/equipment', asyncHandler(authMiddleware), equipmentController.list);
  router.get('/v1/equipment/:id', asyncHandler(authMiddleware), equipmentController.byId);

  router.get('/service-requests', asyncHandler(authMiddleware), serviceController.list);
  router.post('/service-requests', asyncHandler(authMiddleware), upload.array('media', 6), serviceController.create);
  router.get('/service-requests/:id/status', asyncHandler(authMiddleware), serviceController.status);
  router.post('/service-requests/:id/status', asyncHandler(authMiddleware), serviceController.updateStatus);

  router.get('/v1/service-requests', asyncHandler(authMiddleware), serviceController.list);
  router.post('/v1/service-requests', asyncHandler(authMiddleware), upload.array('media', 6), serviceController.create);
  router.get('/v1/service-requests/:id/status', asyncHandler(authMiddleware), serviceController.status);
  router.post('/v1/service-requests/:id/status', asyncHandler(authMiddleware), serviceController.updateStatus);

  router.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    console.error('[miniapp-api] request failed', {
      path: req.originalUrl,
      method: req.method,
      error: err?.message || String(err),
    });
    return res.status(503).json({ error: 'service_unavailable' });
  });

  return router;
}
