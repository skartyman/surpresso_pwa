import express from 'express';
import multer from 'multer';
import { telegramAuth } from '../middleware/telegramAuth.js';
import { createAuthController } from '../controllers/authController.js';
import { createEquipmentController } from '../controllers/equipmentController.js';
import { createServiceController } from '../controllers/serviceController.js';
import { createAdminAuthController } from '../controllers/adminAuthController.js';
import { createAdminController } from '../controllers/adminController.js';
import { createAdminServiceController } from '../controllers/adminServiceController.js';
import { createAdminEmployeeController } from '../controllers/adminEmployeeController.js';
import { requireAuth, requireRole } from '../middleware/adminAuth.js';

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createApiRouter(deps) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 6, fileSize: 30 * 1024 * 1024 },
  });

  const authMiddleware = telegramAuth(deps.clientRepository);
  const authController = createAuthController();
  const equipmentController = createEquipmentController(deps.equipmentRepository);
  const serviceController = createServiceController(deps.serviceRepository, deps.equipmentRepository, deps.serviceRequestNotifier);

  const adminAuthController = createAdminAuthController(deps.userRepository, deps.sessionManager);
  const adminController = createAdminController();
  const adminServiceController = createAdminServiceController(deps.serviceRepository);
  const adminEmployeeController = createAdminEmployeeController(deps.userRepository, deps.serviceRepository);
  const adminAuth = requireAuth(deps.userRepository, deps.sessionManager);

  router.post('/auth/login', asyncHandler(adminAuthController.login));
  router.post('/auth/logout', adminAuthController.logout);
  router.get('/auth/me', asyncHandler(adminAuth), adminAuthController.me);

  router.get('/admin/manager', asyncHandler(adminAuth), requireRole(['manager']), adminController.managerScope);
  router.get('/admin/service', asyncHandler(adminAuth), requireRole(['manager', 'service']), adminController.serviceScope);
  router.get('/admin/content', asyncHandler(adminAuth), requireRole(['manager', 'seo']), adminController.seoScope);

  router.get('/admin/service-engineers', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceController.serviceEngineers));
  router.get('/admin/service-requests', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.list));
  router.get('/admin/service-requests/dashboard', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceController.dashboard));
  router.get('/admin/service-engineers', asyncHandler(adminAuth), requireRole(['manager', 'service_head']), asyncHandler(adminServiceController.listServiceEngineers));
  router.get('/admin/service-requests/:id', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.byId));
  router.post('/admin/service-requests/:id/status', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.updateStatus));
  router.post('/admin/service-requests/:id/assign', asyncHandler(adminAuth), requireRole(['manager', 'service_head']), asyncHandler(adminServiceController.assignManager));
  router.get('/admin/service-requests/:id/assignment-history', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceController.assignmentHistory));
  router.get('/admin/service-requests/:id/history', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.history));
  router.get('/admin/service-requests/:id/notes', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.notes));
  router.post('/admin/service-requests/:id/notes', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.addNote));

  router.get('/admin/users', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.list));
  router.get('/admin/users/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.byId));
  router.post('/admin/users', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager']), asyncHandler(adminEmployeeController.create));
  router.post('/admin/users/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.update));
  router.get('/admin/service-engineers', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.listServiceEngineers));
  router.get('/admin/service-specializations', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.serviceSpecializations));
  router.get('/admin/brands', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.brands));
  router.get('/admin/zones', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.zones));

  router.get('/admin/employees', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.list));
  router.get('/admin/employees/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.byId));
  router.post('/admin/employees', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager']), asyncHandler(adminEmployeeController.create));
  router.patch('/admin/employees/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer']), asyncHandler(adminEmployeeController.update));

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
