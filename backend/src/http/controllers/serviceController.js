import { uploadServiceRequestMedia } from '../../infrastructure/drive/gasDriveClient.js';
import { enrichServiceRequestMedia } from '../utils/serviceRequestMediaView.js';
import { REQUEST_TYPES, normalizeRequestType, resolveDepartmentByType } from '../../domain/entities/requestTypes.js';
import { validateUploadedMediaFiles } from '../utils/uploadedMediaValidation.js';

const ALLOWED_CATEGORIES = new Set(['coffee_machine', 'grinder', 'water']);
const ALLOWED_URGENCY = new Set(['low', 'normal', 'high', 'critical']);

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return Boolean(value);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function formatNotifyMessage(request) {
  const equipmentText = request.equipment
    ? `${request.equipment.brand} ${request.equipment.model} (${request.equipment.id})`
    : request.equipmentId || 'не вибрано';

  return [
    request.type === REQUEST_TYPES.serviceRepair ? '🛠 Нова сервісна заявка' : '📩 Нове клієнтське звернення',
    `ID: ${request.id}`,
    `Тип: ${request.type}`,
    `Контур: ${request.assignedDepartment}`,
    `Клієнт: ${request.client?.companyName || request.clientId}`,
    `Обладнання: ${equipmentText}`,
    `Заголовок: ${request.title || '—'}`,
    `Опис: ${request.description}`,
    request.urgency ? `Терміновість: ${request.urgency}` : null,
    typeof request.canOperateNow === 'boolean' ? `Можна працювати: ${request.canOperateNow ? 'так' : 'ні'}` : null,
    `Медіа: ${request.media?.length || 0}`,
  ].filter(Boolean).join('\n');
}

export function createServiceController(serviceRepository, equipmentRepository, telegramNotifier) {
  const notifier = telegramNotifier || { notifyNewServiceRequest: async () => ({ ok: false, reason: 'not_configured' }) };

  return {
    async list(req, res) {
      const requests = typeof serviceRepository.listByMiniAppScope === 'function'
        ? await serviceRepository.listByMiniAppScope({
          clientId: req.auth.client.id,
          pointUserId: req.auth.pointUser?.id || null,
          locationId: req.auth.location?.id || null,
        })
        : await serviceRepository.listByClientId(req.auth.client.id);
      return res.json({ items: requests.map((item) => enrichServiceRequestMedia(req, item)) });
    },
    async create(req, res) {
      const type = normalizeRequestType(req.body?.type || REQUEST_TYPES.serviceRepair);
      const category = normalizeText(req.body?.category);
      const description = normalizeText(req.body?.description);
      const title = normalizeText(req.body?.title) || description.slice(0, 100);
      const urgency = normalizeText(req.body?.urgency || 'normal');
      const equipmentId = normalizeText(req.body?.equipmentId);
      const canOperateNow = toBoolean(req.body?.canOperateNow ?? req.body?.canOperate ?? false);
      const mediaValidationError = validateUploadedMediaFiles(req.files || []);

      if (!type) {
        return res.status(400).json({ error: 'type_required' });
      }
      if (!description) {
        return res.status(400).json({ error: 'description_required' });
      }
      if (mediaValidationError) {
        return res.status(400).json({ error: mediaValidationError });
      }

      const isServiceRepair = type === REQUEST_TYPES.serviceRepair;
      if (isServiceRepair && (!category || !ALLOWED_CATEGORIES.has(category))) {
        return res.status(400).json({ error: 'category_required' });
      }
      if (isServiceRepair && (!urgency || !ALLOWED_URGENCY.has(urgency))) {
        return res.status(400).json({ error: 'urgency_required' });
      }

      if (equipmentId && isServiceRepair) {
        const equipment = await equipmentRepository.findById(equipmentId);
        if (!equipment) {
          return res.status(400).json({ error: 'equipment_not_found' });
        }

        if (equipment.clientId !== req.auth.client.id) {
          return res.status(403).json({ error: 'equipment_client_mismatch' });
        }

        if (req.auth.location?.id && equipment.locationId && equipment.locationId !== req.auth.location.id) {
          return res.status(403).json({ error: 'equipment_location_mismatch' });
        }
      }

      const requestId = `req-${Date.now()}`;
      const uploadedMedia = [];

      for (const file of req.files || []) {
        const uploaded = await uploadServiceRequestMedia({ entityId: requestId, file });
        uploadedMedia.push(uploaded);
      }

      const payload = {
        id: requestId,
        type,
        equipmentId: equipmentId || null,
        pointUserId: req.auth.pointUser?.id || null,
        locationId: req.auth.location?.id || null,
        category: isServiceRepair ? category : 'general',
        title: title || 'Нове звернення',
        description,
        urgency: isServiceRepair ? urgency : 'normal',
        canOperateNow: isServiceRepair ? canOperateNow : true,
        assignedDepartment: resolveDepartmentByType(type),
        source: 'telegram_mini_app',
        clientId: req.auth.client.id,
        media: uploadedMedia,
      };

      const created = await serviceRepository.create(payload);
      await notifier.notifyNewServiceRequest(formatNotifyMessage(created));
      return res.status(201).json(enrichServiceRequestMedia(req, created));
    },
    async status(req, res) {
      const request = typeof serviceRepository.findByIdForMiniAppScope === 'function'
        ? await serviceRepository.findByIdForMiniAppScope(req.params.id, {
          clientId: req.auth.client.id,
          pointUserId: req.auth.pointUser?.id || null,
          locationId: req.auth.location?.id || null,
        })
        : await serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      return res.json({ id: request.id, status: request.status, updatedAt: request.updatedAt });
    },
    async updateStatus(req, res) {
      const request = typeof serviceRepository.findByIdForMiniAppScope === 'function'
        ? await serviceRepository.findByIdForMiniAppScope(req.params.id, {
          clientId: req.auth.client.id,
          pointUserId: req.auth.pointUser?.id || null,
          locationId: req.auth.location?.id || null,
        })
        : await serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      const nextStatus = String(req.body?.status || '').trim();
      if (!nextStatus) {
        return res.status(400).json({ error: 'status_required' });
      }
      try {
        const updated = await serviceRepository.updateStatus(request.id, nextStatus);
        return res.json({ id: updated.id, status: updated.status, updatedAt: updated.updatedAt });
      } catch {
        return res.status(500).json({ error: 'status_update_failed' });
      }
    },
  };
}
