export class UserRepository {
  async findByEmail(_) { throw new Error('Not implemented'); }
  async findById(_) { throw new Error('Not implemented'); }
  async list(_) { throw new Error('Not implemented'); }
  async create(_) { throw new Error('Not implemented'); }
  async update(_, __) { throw new Error('Not implemented'); }
  async setActive(_, __) { throw new Error('Not implemented'); }
  async setPassword(_, __) { throw new Error('Not implemented'); }
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
  async listForAdmin(_, __) { throw new Error('Not implemented'); }
  async findForAdminById(_) { throw new Error('Not implemented'); }
  async findById(_) { throw new Error('Not implemented'); }
  async updateStatus(_, __, ___) { throw new Error('Not implemented'); }
  async assign(_, __, ___) { throw new Error('Not implemented'); }
  async listHistory(_) { throw new Error('Not implemented'); }
  async listInternalNotes(_) { throw new Error('Not implemented'); }
  async addInternalNote(_, __) { throw new Error('Not implemented'); }
  async analyticsSummary() { throw new Error('Not implemented'); }
}
