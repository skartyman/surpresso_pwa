export function createEquipmentController(equipmentRepository) {
  return {
    async list(req, res) {
      const data = await equipmentRepository.listByClientId(req.auth.client.id);
      return res.json({ items: data });
    },
    async byId(req, res) {
      const item = await equipmentRepository.findById(req.params.id);
      if (!item || item.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Equipment not found' });
      }
      return res.json(item);
    },
  };
}
