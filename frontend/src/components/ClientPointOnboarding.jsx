import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';

export function ClientPointOnboarding({
  profile,
  submitting = false,
  onSubmit,
  compact = false,
}) {
  const { t } = useI18n();
  const networks = Array.isArray(profile?.availableNetworks) ? profile.availableNetworks : [];
  const pointUser = profile?.pointUser || null;
  const initialNetworkId = profile?.network?.id || networks[0]?.id || '';
  const initialLocationId = profile?.location?.id || '';
  const [form, setForm] = useState({
    networkId: initialNetworkId,
    locationId: initialLocationId,
    fullName: pointUser?.fullName || '',
    phone: pointUser?.phone || profile?.client?.phone || '',
    role: pointUser?.role || 'barista',
  });

  useEffect(() => {
    setForm({
      networkId: profile?.network?.id || networks[0]?.id || '',
      locationId: profile?.location?.id || '',
      fullName: pointUser?.fullName || '',
      phone: pointUser?.phone || profile?.client?.phone || '',
      role: pointUser?.role || 'barista',
    });
  }, [networks, pointUser, profile?.client?.phone, profile?.location?.id, profile?.network?.id]);

  const locations = useMemo(() => {
    if (!form.networkId) return [];
    return (Array.isArray(profile?.availableLocations) ? profile.availableLocations : [])
      .filter((item) => item.networkId === form.networkId);
  }, [form.networkId, profile?.availableLocations]);

  useEffect(() => {
    if (!locations.length) {
      setForm((prev) => ({ ...prev, locationId: '' }));
      return;
    }
    if (!locations.some((item) => item.id === form.locationId)) {
      setForm((prev) => ({ ...prev, locationId: locations[0]?.id || '' }));
    }
  }, [form.locationId, locations]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.({
      networkId: form.networkId,
      locationId: form.locationId,
      fullName: form.fullName.trim(),
      contactName: form.fullName.trim(),
      phone: form.phone.trim(),
      role: form.role,
    });
  };

  return (
    <section className={`point-onboarding ${compact ? 'point-onboarding--compact' : ''}`}>
      <div className="point-onboarding__intro">
        <small>{profile?.onboardingComplete ? t('onboarding_ready') : t('onboarding_title')}</small>
        <h3>{compact ? t('onboarding_current') : t('onboarding_title')}</h3>
        <p>{t('onboarding_subtitle')}</p>
      </div>

      <form className="point-onboarding__form" onSubmit={handleSubmit}>
        <label>
          <span>{t('onboarding_network')}</span>
          <select
            value={form.networkId}
            onChange={(event) => setForm((prev) => ({ ...prev, networkId: event.target.value, locationId: '' }))}
          >
            {networks.map((network) => (
              <option key={network.id} value={network.id}>{network.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('onboarding_location')}</span>
          <select
            value={form.locationId}
            onChange={(event) => setForm((prev) => ({ ...prev, locationId: event.target.value }))}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('onboarding_name')}</span>
          <input
            type="text"
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder={t('onboarding_name')}
          />
        </label>

        <label>
          <span>{t('onboarding_phone')}</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            placeholder="+380..."
          />
        </label>

        <label>
          <span>{t('profile_role')}</span>
          <select
            value={form.role}
            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          >
            <option value="barista">{t('role_barista')}</option>
            <option value="manager">{t('role_manager')}</option>
            <option value="owner">{t('role_owner')}</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={submitting || !form.networkId || !form.locationId || !form.fullName.trim()}
        >
          {submitting ? t('saving') : t('onboarding_save')}
        </button>
      </form>
    </section>
  );
}
