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
  const hasBoundPoint = Boolean(profile?.network?.id && profile?.location?.id);
  const initialNetworkId = profile?.network?.id || networks[0]?.id || '';
  const initialLocationId = profile?.location?.id || '';
  const initialMode = hasBoundPoint ? 'existing' : 'new';
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    companyName: profile?.client?.companyName || '',
    networkId: initialNetworkId,
    locationId: initialLocationId,
    networkName: profile?.network?.name || profile?.client?.companyName || '',
    locationName: profile?.location?.name || '',
    locationCity: profile?.location?.city || '',
    locationAddress: profile?.location?.address || '',
    fullName: pointUser?.fullName || '',
    phone: pointUser?.phone || profile?.client?.phone || '',
    role: pointUser?.role || 'barista',
  });

  useEffect(() => {
    setMode(profile?.network?.id && profile?.location?.id ? 'existing' : 'new');
    setForm({
      companyName: profile?.client?.companyName || '',
      networkId: profile?.network?.id || networks[0]?.id || '',
      locationId: profile?.location?.id || '',
      networkName: profile?.network?.name || profile?.client?.companyName || '',
      locationName: profile?.location?.name || '',
      locationCity: profile?.location?.city || '',
      locationAddress: profile?.location?.address || '',
      fullName: pointUser?.fullName || '',
      phone: pointUser?.phone || profile?.client?.phone || '',
      role: pointUser?.role || 'barista',
    });
  }, [networks, pointUser, profile?.client?.companyName, profile?.client?.phone, profile?.location?.address, profile?.location?.city, profile?.location?.id, profile?.location?.name, profile?.network?.id, profile?.network?.name]);

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

  const validationError = (() => {
    if (!form.fullName.trim()) return t('onboarding_validation_name');
    if (mode === 'existing') {
      if (!networks.length) return t('onboarding_no_networks');
      if (!form.networkId) return t('onboarding_validation_network');
      if (!locations.length) return t('onboarding_no_locations');
      if (!form.locationId) return t('onboarding_validation_location');
      return '';
    }
    if (!form.companyName.trim()) return t('onboarding_validation_company');
    if (!form.networkName.trim()) return t('onboarding_validation_network_new');
    if (!form.locationName.trim()) return t('onboarding_validation_location_new');
    return '';
  })();

  const handleSubmit = (event) => {
    event.preventDefault();
    if (validationError) return;
    onSubmit?.({
      companyName: form.companyName.trim(),
      networkId: mode === 'existing' ? form.networkId : '',
      locationId: mode === 'existing' ? form.locationId : '',
      networkName: mode === 'new' ? form.networkName.trim() : '',
      locationName: mode === 'new' ? form.locationName.trim() : '',
      locationCity: mode === 'new' ? form.locationCity.trim() : '',
      locationAddress: mode === 'new' ? form.locationAddress.trim() : '',
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
          <span>{t('profile_company')}</span>
          <input
            type="text"
            value={form.companyName}
            onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
            placeholder={t('profile_company')}
          />
        </label>

        <label>
          <span>{t('onboarding_mode')}</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="existing" disabled={!networks.length}>{t('onboarding_mode_existing')}</option>
            <option value="new">{t('onboarding_mode_new')}</option>
          </select>
        </label>

        {mode === 'existing' ? (
          <>
        <label>
          <span>{t('onboarding_network')}</span>
          <select
            value={form.networkId}
            onChange={(event) => setForm((prev) => ({ ...prev, networkId: event.target.value, locationId: '' }))}
          >
            {!networks.length ? <option value="">{t('onboarding_no_networks')}</option> : null}
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
            {!locations.length ? <option value="">{t('onboarding_no_locations')}</option> : null}
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>
          </>
        ) : (
          <>
            <label>
              <span>{t('onboarding_network_new')}</span>
              <input
                type="text"
                value={form.networkName}
                onChange={(event) => setForm((prev) => ({ ...prev, networkName: event.target.value }))}
                placeholder={t('onboarding_network_new')}
              />
            </label>

            <label>
              <span>{t('onboarding_location_new')}</span>
              <input
                type="text"
                value={form.locationName}
                onChange={(event) => setForm((prev) => ({ ...prev, locationName: event.target.value }))}
                placeholder={t('onboarding_location_new')}
              />
            </label>

            <label>
              <span>{t('onboarding_city')}</span>
              <input
                type="text"
                value={form.locationCity}
                onChange={(event) => setForm((prev) => ({ ...prev, locationCity: event.target.value }))}
                placeholder={t('onboarding_city')}
              />
            </label>

            <label>
              <span>{t('onboarding_address')}</span>
              <input
                type="text"
                value={form.locationAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, locationAddress: event.target.value }))}
                placeholder={t('onboarding_address')}
              />
            </label>
          </>
        )}

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
          disabled={submitting || Boolean(validationError)}
        >
          {submitting ? t('saving') : t('onboarding_save')}
        </button>

        {validationError ? <p className="notice notice-error">{validationError}</p> : null}
      </form>
    </section>
  );
}
