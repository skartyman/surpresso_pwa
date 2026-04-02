export function createAdminController() {
  return {
    managerScope(_, res) {
      return res.json({
        role: 'manager',
        sections: ['requests', 'clients', 'equipment', 'rentals', 'orders'],
      });
    },
    serviceScope(_, res) {
      return res.json({
        role: 'service',
        sections: ['service-requests', 'equipment', 'photos', 'comments', 'statuses'],
      });
    },
    seoScope(_, res) {
      return res.json({
        role: 'seo',
        sections: ['news', 'posters', 'pages', 'seo', 'media'],
      });
    },
  };
}
