export function createAdminAnalyticsController(serviceRepository, userRepository) {
  return {
    async summary(_, res) {
      const [service, employees] = await Promise.all([
        serviceRepository.analyticsSummary(),
        userRepository.list(),
      ]);

      const managerStats = employees.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {});

      return res.json({
        dashboards: {
          service,
          managers: managerStats,
          company: {
            activeEmployees: employees.filter((item) => item.isActive).length,
            totalEmployees: employees.length,
          },
        },
      });
    },
  };
}
