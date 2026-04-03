const REQUEST_TYPES = new Set([
  'service_repair',
  'coffee_order',
  'coffee_tasting',
  'grinder_check',
  'rental_auto',
  'rental_pro',
  'feedback',
]);
const LEGACY_CATEGORY_MAP = {
  coffee_machine: 'service_repair',
  grinder: 'service_repair',
  water: 'service_repair',
};

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

function normalizeRequestType(value) {
  const raw = normalizeText(value);
  const normalized = LEGACY_CATEGORY_MAP[raw] || raw;
  return REQUEST_TYPES.has(normalized) ? normalized : null;
}

function formatNotifyMessage(request) {
  const equipmentText = request.equipment
    ? `${request.equipment.brand} ${request.equipment.model} (${request.equipment.id})`
    : request.equipmentId || 'не указано';

  return [
    '🛠 Новая заявка',
    `ID: ${request.id}`,
    `Клиент: ${request.client?.companyName || request.clientId}`,
    `Оборудование: ${equipmentText}`,
    `Тип: ${request.category}`,
    `Описание: ${request.description}`,
    `Срочность: ${request.urgency}`,
    `Можно работать: ${request.canOperateNow ? 'да' : 'нет'}`,
    `Медиа: ${request.media?.length || 0}`,
  ].join('\n');
}

async function resolveDefaultAssignee(category, userRepository) {
  const users = await userRepository.list();
  if (category === 'service_repair') {
    return users.find((user) => user.role === 'service_head' && user.isActive)?.id || null;
  }
  return users.find((user) => user.role === 'sales_manager' && user.isActive)?.id || null;
}

export function createServiceController(serviceRepository, equipmentRepository, telegramNotifier, userRepository) {
  const notifier = telegramNotifier || { notifyNewServiceRequest: async () => ({ ok: false, reason: 'not_configured' }) };
  return {
    async list(req, res) {
      const requests = await serviceRepository.listByClientId(req.auth.client.id);
      return res.json({ items: requests });
    },
    async create(req, res) {
      const category = normalizeRequestType(req.body?.category || req.body?.type);
      const description = normalizeText(req.body?.description);
      const urgency = normalizeText(req.body?.urgency || 'normal');
      const equipmentId = normalizeText(req.body?.equipmentId);
      const canOperateNow = toBoolean(req.body?.canOperateNow ?? req.body?.canOperate ?? false);

      if (!category) {
        return res.status(400).json({ error: 'category_required' });
      }
      if (!description) {
        return res.status(400).json({ error: 'description_required' });
      }
      if (!urgency || !ALLOWED_URGENCY.has(urgency)) {
        return res.status(400).json({ error: 'urgency_required' });
      }

      if (equipmentId) {
        const equipment = await equipmentRepository.findById(equipmentId);
        if (!equipment) {
          return res.status(400).json({ error: 'equipment_not_found' });
        }

        if (equipment.clientId !== req.auth.client.id) {
          return res.status(403).json({ error: 'equipment_client_mismatch' });
        }
      }

      const assignedToUserId = userRepository ? await resolveDefaultAssignee(category, userRepository) : null;

      const payload = {
        equipmentId: equipmentId || null,
        category,
        description,
        urgency,
        canOperateNow,
        source: 'telegram_mini_app',
        clientId: req.auth.client.id,
        assignedToUserId,
        media: (req.files || []).map((file) => ({
          id: `media-${file.filename}`,
          type: file.mimetype.startsWith('video') ? 'video' : 'image',
          url: `/media/${file.filename}`,
        })),
      };

      const created = await serviceRepository.create(payload);
      await notifier.notifyNewServiceRequest(formatNotifyMessage(created));
      return res.status(201).json(created);
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
