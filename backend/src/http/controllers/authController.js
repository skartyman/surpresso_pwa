export function createAuthController(clientRepository) {
  return {
    me(req, res) {
      return res.json({
        client: req.auth.client,
        telegramUser: req.auth.telegramUser,
        profile: req.auth.profile || {
          client: req.auth.client,
          pointUser: req.auth.pointUser || null,
          network: req.auth.network || null,
          location: req.auth.location || null,
          onboardingComplete: Boolean(req.auth.location),
          availableNetworks: [],
          availableLocations: [],
        },
      });
    },

    async registerProfile(req, res) {
      if (typeof clientRepository?.registerMiniAppProfile !== 'function') {
        return res.status(501).json({ error: 'registration_not_supported' });
      }

      const payload = {
        fullName: String(req.body?.fullName || '').trim(),
        contactName: String(req.body?.contactName || '').trim(),
        phone: String(req.body?.phone || '').trim(),
        companyName: String(req.body?.companyName || '').trim(),
        networkId: String(req.body?.networkId || '').trim(),
        locationId: String(req.body?.locationId || '').trim(),
        role: String(req.body?.role || 'barista').trim() || 'barista',
      };

      if (!payload.networkId || !payload.locationId) {
        return res.status(400).json({ error: 'network_and_location_required' });
      }

      const profile = await clientRepository.registerMiniAppProfile(req.auth.telegramUser, payload);
      return res.json({
        ok: true,
        client: profile?.client || req.auth.client,
        telegramUser: req.auth.telegramUser,
        profile,
      });
    },
  };
}
