const ROLE_SECTIONS = {
  service_engineer: ['service'],
  sales_manager: ['sales_clients', 'communications'],
  service_head: ['service', 'analytics'],
  owner: ['service', 'sales_clients', 'communications', 'employees', 'analytics'],
  director: ['service', 'sales_clients', 'communications', 'employees', 'analytics'],
};

export function createAdminController() {
  return {
    scope(req, res) {
      return res.json({
        role: req.adminUser.role,
        sections: ROLE_SECTIONS[req.adminUser.role] || [],
      });
    },
  };
}
