export function createEquipmentController(equipmentRepository) {
  return {
    async list(req, res) {
      const data = typeof equipmentRepository.listByMiniAppScope === 'function'
        ? await equipmentRepository.listByMiniAppScope({
          clientId: req.auth.client.id,
          locationId: req.auth.location?.id || null,
        })
        : await equipmentRepository.listByClientId(req.auth.client.id);
      return res.json({ items: data });
    },
    async byId(req, res) {
      const item = await equipmentRepository.findById(req.params.id);
      const locationId = req.auth.location?.id || null;
      const allowedByLocation = !locationId || item?.locationId === locationId;
      if (!item || item.clientId !== req.auth.client.id || !allowedByLocation) {
        return res.status(404).json({ error: 'Equipment not found' });
      }
      return res.json(item);
    },
  };
}
