export function createEquipmentController(equipmentRepository) {
  return {
    list(req, res) {
      const data = equipmentRepository.listByClientId(req.auth.client.id);
      return res.json({ items: data });
    },
    byId(req, res) {
      const item = equipmentRepository.findById(req.params.id);
      if (!item || item.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Equipment not found' });
      }
      return res.json(item);
    },
  };
}
