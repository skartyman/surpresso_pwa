import { useEffect, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function ServicePage() {
  const { t } = useI18n();
  const [equipment, setEquipment] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successId, setSuccessId] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    equipmentId: '',
    category: 'coffee_machine',
    description: '',
    urgency: 'normal',
    canOperateNow: true,
  });

  useEffect(() => {
    telegramClientApi.listEquipment().then((data) => {
      setEquipment(Array.isArray(data?.items) ? data.items : []);
    });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessId('');
    setIsSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('type', 'service_repair');
      payload.append('equipmentId', form.equipmentId);
      payload.append('category', form.category);
      payload.append('description', form.description.trim());
      payload.append('urgency', form.urgency);
      payload.append('canOperateNow', String(form.canOperateNow));
      const created = await telegramClientApi.createServiceRequest(payload);
      setSuccessId(created.id);
      setForm((prev) => ({ ...prev, description: '' }));
    } catch (e) {
      setError(e.message || t('err_request_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="service-page">
      <header className="hero service-hero">
        <h2>{t('service_new')}</h2>
        <p>{t('service_intro')}</p>
      </header>

      <form className="service-panel service-form" onSubmit={submit}>
        <label className="service-field-label">{t('equipment_optional')}</label>
        <select value={form.equipmentId} onChange={(e) => setForm((prev) => ({ ...prev, equipmentId: e.target.value }))}>
          <option value="">{t('equipment_skip')}</option>
          {equipment.map((item) => (
            <option key={item.id} value={item.id}>{item.brand} {item.model}</option>
          ))}
        </select>

        <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
          <option value="coffee_machine">{t('cat_coffee_machine')}</option>
          <option value="grinder">{t('cat_grinder')}</option>
          <option value="water">{t('cat_water')}</option>
        </select>

        <textarea
          value={form.description}
          required
          placeholder={t('problem_desc')}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />

        <select value={form.urgency} onChange={(e) => setForm((prev) => ({ ...prev, urgency: e.target.value }))}>
          <option value="low">{t('low')}</option>
          <option value="normal">{t('normal')}</option>
          <option value="high">{t('high')}</option>
          <option value="critical">{t('critical')}</option>
        </select>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.canOperateNow}
            onChange={(e) => setForm((prev) => ({ ...prev, canOperateNow: e.target.checked }))}
          />
          <span>{t('can_operate')}</span>
        </label>

        <button type="submit" disabled={isSubmitting}>{isSubmitting ? t('sending') : t('send_request')}</button>

        {successId ? <p className="notice notice-success">{t('sent_ok')} ID: {successId}</p> : null}
        {error ? <p className="notice notice-error">{error}</p> : null}
      </form>
    </section>
  );
}
