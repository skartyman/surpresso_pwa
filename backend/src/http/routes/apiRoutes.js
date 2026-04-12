import express from 'express';
import multer from 'multer';
import { createTelegramAuthController, telegramAuth } from '../middleware/telegramAuth.js';
import { createAuthController } from '../controllers/authController.js';
import { createEquipmentController } from '../controllers/equipmentController.js';
import { createServiceController } from '../controllers/serviceController.js';
import { createAdminAuthController } from '../controllers/adminAuthController.js';
import { createAdminController } from '../controllers/adminController.js';
import { createAdminServiceController } from '../controllers/adminServiceController.js';
import { createAdminServiceOpsController } from '../controllers/adminServiceOpsController.js';
import { createAdminEmployeeController } from '../controllers/adminEmployeeController.js';
import { createAdminCatalogController } from '../controllers/adminCatalogController.js';
import { requireAuth, requireRole } from '../middleware/adminAuth.js';
import {
  isAllowedUploadDocumentMimeType,
  isAllowedUploadMimeType,
  MAX_UPLOAD_DOCUMENT_FILES,
  MAX_UPLOAD_DOCUMENT_FILE_SIZE,
  MAX_UPLOAD_MEDIA_FILES,
  MAX_UPLOAD_MEDIA_FILE_SIZE,
} from '../utils/uploadedMediaValidation.js';

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createApiRouter(deps) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: MAX_UPLOAD_MEDIA_FILES, fileSize: MAX_UPLOAD_MEDIA_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!isAllowedUploadMimeType(file?.mimetype)) {
        const error = new Error('unsupported_media_type');
        error.statusCode = 400;
        return cb(error);
      }
      return cb(null, true);
    },
  });
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: MAX_UPLOAD_DOCUMENT_FILES, fileSize: MAX_UPLOAD_DOCUMENT_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!isAllowedUploadDocumentMimeType(file?.mimetype)) {
        const error = new Error('unsupported_document_type');
        error.statusCode = 400;
        return cb(error);
      }
      return cb(null, true);
    },
  });

  const authMiddleware = telegramAuth(deps.clientRepository);
  const authMeMiddleware = telegramAuth(deps.clientRepository, { allowInitDataFallback: false });
  const telegramAuthController = createTelegramAuthController(deps.clientRepository);
  const authController = createAuthController(deps.clientRepository);
  const equipmentController = createEquipmentController(deps.equipmentRepository);
  const serviceController = createServiceController(deps.serviceRepository, deps.equipmentRepository, deps.serviceRequestNotifier, deps.serviceRequestEvents);

  const adminAuthController = createAdminAuthController(deps.userRepository, deps.sessionManager);
  const adminController = createAdminController();
  const adminServiceController = createAdminServiceController(deps.serviceRepository, {
    uploadsRoot: deps.uploadsRoot,
    equipmentRepository: deps.equipmentRepository,
    clientRepository: deps.clientRepository,
    serviceRequestEvents: deps.serviceRequestEvents,
  });
  const adminServiceOpsController = createAdminServiceOpsController(deps.serviceOpsRepository, {
    uploadsRoot: deps.uploadsRoot,
    botGateway: deps.botGateway,
    executiveNotifier: deps.executiveNotifier,
    notificationCenterService: deps.notificationCenterService,
  });
  const adminEmployeeController = createAdminEmployeeController(deps.userRepository, deps.serviceRepository);
  const adminCatalogController = createAdminCatalogController(deps.serviceOpsRepository, { uploadsRoot: deps.uploadsRoot });
  const adminAuth = requireAuth(deps.userRepository, deps.sessionManager);

  router.post('/auth/login', asyncHandler(adminAuthController.login));

  router.post('/v1/auth/login', asyncHandler(telegramAuthController.login));
  router.post('/v1/auth/logout', telegramAuthController.logout);
  router.post('/auth/logout', adminAuthController.logout);
  router.get('/auth/me', asyncHandler(adminAuth), adminAuthController.me);
  router.post('/auth/change-password', asyncHandler(adminAuth), asyncHandler(adminAuthController.changePassword));

  router.get('/admin/manager', asyncHandler(adminAuth), requireRole(['manager']), adminController.managerScope);
  router.get('/admin/service', asyncHandler(adminAuth), requireRole(['manager', 'service']), adminController.serviceScope);
  router.get('/admin/content', asyncHandler(adminAuth), requireRole(['manager', 'seo']), adminController.seoScope);

  router.get('/admin/service-engineers', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'owner', 'director']), asyncHandler(adminServiceController.listServiceEngineers));
  router.get('/admin/service-requests', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.list));
  router.get('/admin/service-requests/events', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.events));
  router.get('/admin/service-requests/dashboard', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceController.dashboard));
  router.post('/admin/service-requests', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'owner', 'director']), upload.array('media', 6), asyncHandler(adminServiceController.create));
  router.get('/admin/service-requests/:id', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.byId));
  router.delete('/admin/service-requests/:id', asyncHandler(adminAuth), requireRole(['service_head', 'owner', 'director']), asyncHandler(adminServiceController.deleteById));
  router.post('/admin/service-requests/:id/status', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.updateStatus));
  router.post('/admin/service-requests/:id/assign', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'service_engineer']), asyncHandler(adminServiceController.assignManager));
  router.get('/admin/service-requests/:id/assignment-history', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceController.assignmentHistory));
  router.get('/admin/service-requests/:id/history', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.history));
  router.get('/admin/service-requests/:id/notes', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.notes));
  router.post('/admin/service-requests/:id/notes', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceController.addNote));
  router.post('/admin/service-requests/:id/media', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), upload.array('media', 6), asyncHandler(adminServiceController.addMedia));

  router.get('/admin/service/dashboard', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.dashboard));
  router.get('/admin/service/kpi', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.serviceKpi));
  router.get('/admin/executive/summary', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.executiveSummary));
  router.get('/admin/executive/alerts', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.alerts));
  router.get('/admin/executive/notifications/preview', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.notificationsPreview));
  router.post('/admin/executive/notifications/trigger', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.notificationsTrigger));
  router.get('/admin/executive/notification-center', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.notificationCenter));
  router.get('/admin/executive/digests/plan', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.scheduledDigestPlan));
  router.post('/admin/executive/digests/run', asyncHandler(adminAuth), requireRole(['owner']), asyncHandler(adminServiceOpsController.scheduledDigestRun));
  router.get('/admin/reports/service-cases.csv', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner']), asyncHandler(adminServiceOpsController.exportServiceCases));
  router.get('/admin/reports/executive-summary.csv', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.exportExecutiveSummary));
  router.get('/admin/reports/sales-flow.csv', asyncHandler(adminAuth), requireRole(['sales_manager', 'owner']), asyncHandler(adminServiceOpsController.exportSalesFlow));
  router.get('/admin/reports/executive-weekly', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.weeklyExecutiveReport));
  router.get('/admin/reports/history', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.reportExportHistory));
  router.get('/admin/reports/presets', asyncHandler(adminAuth), requireRole(['owner', 'director']), asyncHandler(adminServiceOpsController.reportPresets));
  router.post('/admin/reports/presets', asyncHandler(adminAuth), requireRole(['owner']), asyncHandler(adminServiceOpsController.saveReportPreset));
  router.get('/admin/service-cases', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.listServiceCases));
  router.get('/admin/service-cases/:id', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.byServiceCaseId));
  router.post('/admin/service-cases/:id/assign', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.assign));
  router.post('/admin/service-cases/:id/status', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.updateStatus));
  router.post('/admin/service-cases/:id/notes', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.addNote));
  router.post('/admin/director/service-cases/:id/process', asyncHandler(adminAuth), requireRole(['director', 'owner']), asyncHandler(adminServiceOpsController.directorProcess));
  router.get('/admin/director/queue', asyncHandler(adminAuth), requireRole(['director', 'owner']), asyncHandler(adminServiceOpsController.directorQueue));
  router.post('/admin/director/service-cases/:id/commercial-route', asyncHandler(adminAuth), requireRole(['director', 'owner']), asyncHandler(adminServiceOpsController.directorCommercialRoute));
  router.post('/admin/service-cases/:id/note', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.addNote));
  router.post('/admin/service-cases/:id/media', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), upload.array('media', 6), asyncHandler(adminServiceOpsController.addMedia));
  router.delete('/admin/media/:mediaId', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.deleteMedia));
  router.get('/admin/service-cases/:id/history', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.history));
  router.get('/admin/equipment', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.listEquipment));
  router.post('/admin/equipment', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.createEquipment));
  router.delete('/admin/equipment/:id', asyncHandler(adminAuth), requireRole(['service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.deleteEquipment));
  router.post('/admin/intake', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.intakeCreate));
  router.get('/admin/equipment/dashboard', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.equipmentDashboard));
  router.get('/admin/equipment/:id', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.equipmentById));
  router.patch('/admin/equipment/:id', asyncHandler(adminAuth), requireRole(['manager', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.updateEquipment));
  router.get('/admin/equipment/:id/detail', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.equipmentDetail));
  router.post('/admin/equipment/:id/post-telegram', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), asyncHandler(adminServiceOpsController.postEquipmentToTelegram));
  router.post('/admin/equipment/:id/media', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'owner', 'director']), upload.array('media', 6), asyncHandler(adminServiceOpsController.addEquipmentMedia));
  router.post('/admin/equipment/:id/comments', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.addEquipmentComment));
  router.post('/admin/equipment/:id/notes', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.addEquipmentNote));
  router.get('/admin/equipment/:id/tasks', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.listServiceTasks));
  router.post('/admin/equipment/:id/tasks', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.createServiceTask));
  router.patch('/admin/tasks/:taskId/status', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.updateServiceTaskStatus));
  router.post('/admin/equipment/:id/commercial-status', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.updateCommercialStatus));
  router.get('/admin/sales/equipment', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.listSalesEquipment));
  router.get('/admin/catalog/products', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), asyncHandler(adminCatalogController.listProducts));
  router.post('/admin/catalog/products', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), upload.array('media', 1), asyncHandler(adminCatalogController.saveProduct));
  router.delete('/admin/catalog/products/:key', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), asyncHandler(adminCatalogController.deleteProduct));
  router.get('/admin/catalog/pricelists', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), asyncHandler(adminCatalogController.listPricelists));
  router.post('/admin/catalog/pricelists', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), documentUpload.array('file', 1), asyncHandler(adminCatalogController.savePricelist));
  router.delete('/admin/catalog/pricelists/:key', asyncHandler(adminAuth), requireRole(['manager', 'sales_manager', 'owner', 'director']), asyncHandler(adminCatalogController.deletePricelist));
  router.get('/catalog/products', asyncHandler(adminCatalogController.publicProducts));
  router.post('/admin/equipment/:id/reserve-rent', asyncHandler(adminAuth), requireRole(['sales_manager', 'owner']), asyncHandler(adminServiceOpsController.reserveForRent));
  router.post('/admin/equipment/:id/reserve-sale', asyncHandler(adminAuth), requireRole(['sales_manager', 'owner']), asyncHandler(adminServiceOpsController.reserveForSale));
  router.get('/admin/equipment/:id/service-cases', asyncHandler(adminAuth), requireRole(['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director']), asyncHandler(adminServiceOpsController.equipmentServiceCases));

  router.get('/admin/users', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.list));
  router.get('/admin/users/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.byId));
  router.post('/admin/users', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager']), asyncHandler(adminEmployeeController.create));
  router.post('/admin/users/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.update));
  router.get('/admin/service-specializations', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.serviceSpecializations));
  router.get('/admin/brands', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.brands));
  router.get('/admin/zones', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.zones));

  router.get('/admin/employees', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.list));
  router.get('/admin/employees/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.byId));
  router.post('/admin/employees', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager']), asyncHandler(adminEmployeeController.create));
  router.patch('/admin/employees/:id', asyncHandler(adminAuth), requireRole(['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo']), asyncHandler(adminEmployeeController.update));

  router.get('/v1/auth/me', asyncHandler(authMeMiddleware), authController.me);
  router.post('/v1/auth/register-profile', asyncHandler(authMiddleware), asyncHandler(authController.registerProfile));
  router.get('/v1/equipment', asyncHandler(authMiddleware), equipmentController.list);
  router.get('/equipment', asyncHandler(authMiddleware), equipmentController.list);
  router.get('/v1/equipment/:id', asyncHandler(authMiddleware), equipmentController.byId);
  router.get('/equipment/:id', asyncHandler(authMiddleware), equipmentController.byId);

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

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'media_file_too_large' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'too_many_media_files' });
      return res.status(400).json({ error: 'media_upload_failed' });
    }

    if (err?.message === 'unsupported_media_type') {
      return res.status(err.statusCode || 400).json({ error: 'unsupported_media_type' });
    }
    if (err?.message === 'unsupported_document_type') {
      return res.status(err.statusCode || 400).json({ error: 'unsupported_document_type' });
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
