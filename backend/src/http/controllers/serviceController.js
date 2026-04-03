import { uploadServiceRequestMedia } from '../../infrastructure/drive/gasDriveClient.js';
import { enrichServiceRequestMedia } from '../utils/serviceRequestMediaView.js';
import { REQUEST_TYPES, normalizeRequestType, resolveDepartmentByType } from '../../domain/entities/requestTypes.js';

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
    : request.equipmentId || 'не указано';

  return [
    request.type === REQUEST_TYPES.serviceRepair ? '🛠 Новая сервисная заявка' : '📩 Новое клиентское обращение',
    `ID: ${request.id}`,
    `Тип: ${request.type}`,
    `Контур: ${request.assignedDepartment}`,
    `Клиент: ${request.client?.companyName || request.clientId}`,
    `Оборудование: ${equipmentText}`,
    `Заголовок: ${request.title || '—'}`,
    `Описание: ${request.description}`,
    request.urgency ? `Срочность: ${request.urgency}` : null,
    typeof request.canOperateNow === 'boolean' ? `Можно работать: ${request.canOperateNow ? 'да' : 'нет'}` : null,
    `Медиа: ${request.media?.length || 0}`,
  ].filter(Boolean).join('\n');
}

export function createServiceController(serviceRepository, equipmentRepository, telegramNotifier) {
  const notifier = telegramNotifier || { notifyNewServiceRequest: async () => ({ ok: false, reason: 'not_configured' }) };

  return {
    async list(req, res) {
      const requests = await serviceRepository.listByClientId(req.auth.client.id);
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

      if (!type) {
        return res.status(400).json({ error: 'type_required' });
      }
      if (!description) {
        return res.status(400).json({ error: 'description_required' });
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
        category: isServiceRepair ? category : 'general',
        title: title || 'Новое обращение',
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
      const request = await serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      return res.json({ id: request.id, status: request.status, updatedAt: request.updatedAt });
    },
    async updateStatus(req, res) {
      const request = await serviceRepository.findById(req.params.id);
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
