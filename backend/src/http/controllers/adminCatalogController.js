import { storeServiceMediaFile } from '../../infrastructure/repositories/serviceOpsRepository.js';
import { uploadDriveMedia } from '../../infrastructure/drive/gasDriveClient.js';
import { uploadR2Media } from '../../infrastructure/storage/r2Client.js';
import { validateUploadedDocumentFiles, validateUploadedMediaFiles } from '../utils/uploadedMediaValidation.js';

const PRODUCT_REPORT_TYPE = 'catalog_product';
const PRICELIST_REPORT_TYPE = 'catalog_pricelist';

function mapPreset(item) {
  const data = JSON.parse(item.filtersJson || '{}');
  return {
    ...item,
    data,
  };
}

async function persistCatalogFile({ uploadsRoot, file, entityId }) {
  try {
    return await uploadR2Media({ file, prefix: 'sales-catalog', entityId });
  } catch (error) {
    if (error?.code !== 'r2_not_configured') throw error;
  }

  try {
    const uploaded = await uploadDriveMedia({ entityId, file });
    return {
      filePath: `drive:${uploaded.fileId || entityId}`,
      fileUrl: uploaded.fileUrl,
      previewUrl: uploaded.previewUrl || uploaded.fileUrl,
      mimeType: uploaded.mimeType || file.mimetype,
      originalName: uploaded.originalName || file.originalname,
      size: uploaded.size || file.size || 0,
    };
  } catch (error) {
    if (error?.message !== 'gas_not_configured') throw error;
    const stored = await storeServiceMediaFile({ uploadsRoot, file, prefix: 'catalog' });
    return {
      filePath: stored.filePath,
      fileUrl: stored.fileUrl,
      previewUrl: stored.fileUrl,
      mimeType: file.mimetype,
      originalName: file.originalname,
      size: file.size || 0,
    };
  }
}

export function createAdminCatalogController(serviceOpsRepository, { uploadsRoot } = {}) {
  function assertAllowed(role) {
    return ['manager', 'sales_manager', 'owner', 'director'].includes(role);
  }

  return {
    async listProducts(req, res) {
      if (!assertAllowed(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listReportPresets?.({ reportType: PRODUCT_REPORT_TYPE, ownerRole: req.adminUser?.role || null }) || [];
      return res.json({ items: items.map(mapPreset) });
    },

    async saveProduct(req, res) {
      if (!assertAllowed(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
      const mediaValidationError = validateUploadedMediaFiles(req.files || []);
      if (mediaValidationError) return res.status(400).json({ error: mediaValidationError });

      const title = String(req.body?.title || '').trim();
      const category = String(req.body?.category || '').trim();
      if (!title) return res.status(400).json({ error: 'title_required' });
      if (!category) return res.status(400).json({ error: 'category_required' });

      let heroMedia = null;
      if (req.files?.[0]) {
        heroMedia = await persistCatalogFile({
          uploadsRoot,
          file: req.files[0],
          entityId: `catalog-product-${Date.now()}`,
        });
      }

      const key = String(req.body?.key || `${category}-${title}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9а-яіїєґ_-]+/gi, '-')
        .replace(/^-+|-+$/g, '');

      const item = await serviceOpsRepository.saveReportPreset?.({
        key: `catalog-product-${key}`,
        title,
        reportType: PRODUCT_REPORT_TYPE,
        filtersJson: JSON.stringify({
          category,
          subtitle: String(req.body?.subtitle || '').trim(),
          description: String(req.body?.description || '').trim(),
          price: String(req.body?.price || '').trim(),
          currency: String(req.body?.currency || '').trim() || 'UAH',
          priceMode: String(req.body?.priceMode || '').trim() || 'sale',
          availability: String(req.body?.availability || '').trim() || 'available',
          ctaLabel: String(req.body?.ctaLabel || '').trim(),
          heroMedia,
        }),
        ownerRole: null,
        createdByUserId: req.adminUser?.id || null,
      });

      return res.status(201).json({ item: mapPreset(item) });
    },

    async deleteProduct(req, res) {
      if (!assertAllowed(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
      const removed = await serviceOpsRepository.deleteReportPresetByKey?.(req.params.key);
      if (!removed) return res.status(404).json({ error: 'not_found' });
      return res.json({ removed });
    },

    async listPricelists(req, res) {
      if (!assertAllowed(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listReportPresets?.({ reportType: PRICELIST_REPORT_TYPE, ownerRole: req.adminUser?.role || null }) || [];
      return res.json({ items: items.map(mapPreset) });
    },

    async savePricelist(req, res) {
      if (!assertAllowed(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
      const documentValidationError = validateUploadedDocumentFiles(req.files || [], { required: true });
      if (documentValidationError) return res.status(400).json({ error: documentValidationError });

      const title = String(req.body?.title || '').trim();
      const category = String(req.body?.category || '').trim();
      if (!title) return res.status(400).json({ error: 'title_required' });
      if (!category) return res.status(400).json({ error: 'category_required' });

      const document = await persistCatalogFile({
        uploadsRoot,
        file: req.files[0],
        entityId: `catalog-pricelist-${Date.now()}`,
      });
      const key = String(req.body?.key || `${category}-${title}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9а-яіїєґ_-]+/gi, '-')
        .replace(/^-+|-+$/g, '');

      const item = await serviceOpsRepository.saveReportPreset?.({
        key: `catalog-pricelist-${key}`,
        title,
        reportType: PRICELIST_REPORT_TYPE,
        filtersJson: JSON.stringify({
          category,
          note: String(req.body?.note || '').trim(),
          document,
        }),
        ownerRole: null,
        createdByUserId: req.adminUser?.id || null,
      });
      return res.status(201).json({ item: mapPreset(item) });
    },

    async deletePricelist(req, res) {
      if (!assertAllowed(req.adminUser?.role)) return res.status(403).json({ error: 'forbidden' });
      const removed = await serviceOpsRepository.deleteReportPresetByKey?.(req.params.key);
      if (!removed) return res.status(404).json({ error: 'not_found' });
      return res.json({ removed });
    },
  };
}
