export class UserRepository {
  async findByEmail(_) { throw new Error('Not implemented'); }
  async findById(_) { throw new Error('Not implemented'); }
  async listForAdmin(_) { throw new Error('Not implemented'); }
  async create(_) { throw new Error('Not implemented'); }
  async updateById(_, __) { throw new Error('Not implemented'); }
}

export class ClientRepository {
  async findByTelegramUserId(_) { throw new Error('Not implemented'); }
}

export class EquipmentRepository {
  async listByClientId(_) { throw new Error('Not implemented'); }
  async findById(_) { throw new Error('Not implemented'); }
}

export class ServiceRequestRepository {
  async listByClientId(_) { throw new Error('Not implemented'); }
  async create(_) { throw new Error('Not implemented'); }
  async listForAdmin(_) { throw new Error('Not implemented'); }
  async findForAdminById(_) { throw new Error('Not implemented'); }
  async findById(_) { throw new Error('Not implemented'); }
  async updateStatus(_, __, ___) { throw new Error('Not implemented'); }
  async listHistory(_) { throw new Error('Not implemented'); }
  async listInternalNotes(_) { throw new Error('Not implemented'); }
  async addInternalNote(_, __) { throw new Error('Not implemented'); }
}
