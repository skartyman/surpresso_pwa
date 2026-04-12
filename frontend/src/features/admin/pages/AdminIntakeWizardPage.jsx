import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';

const STEPS = [
  'Владелец',
  'Тип техники',
  'Идентификация',
  'Состояние/комплектность',
  'Проблема',
  'Фото/видео',
  'Подтверждение',
];

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

export function AdminIntakeWizardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const mode = String(searchParams.get('mode') || 'intake');
  const initialOwner = ['client', 'company'].includes(String(searchParams.get('owner') || ''))
    ? String(searchParams.get('owner'))
    : 'client';
  const basePath = getBaseAdminPath(location.pathname);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [form, setForm] = useState({
    ownerType: initialOwner,
    equipmentType: 'grinder',
    intakeType: 'manual_intake',
    brand: '',
    model: '',
    serial: '',
    internalNumber: '',
    clientName: '',
    clientPhone: '',
    clientLocation: '',
    companyLocation: '',
    problemDescription: '',
    damageDescription: '',
    intakeComment: '',
  });

  const isFinal = step === STEPS.length - 1;
  const isCompany = form.ownerType === 'company';
  const isClient = form.ownerType === 'client';
  const canNext = useMemo(() => {
    if (step === 2 && isClient) return Boolean(form.model?.trim()) && Boolean(form.serial?.trim());
    if (step === 2 && isCompany) return Boolean(form.internalNumber?.trim()) && (Boolean(form.brand?.trim()) || Boolean(form.model?.trim()));
    if (step === 4 && isClient) return Boolean(form.problemDescription?.trim());
    if (step === 4 && isCompany) return Boolean(form.problemDescription?.trim()) || Boolean(form.intakeComment?.trim());
    return true;
  }, [step, form, isClient, isCompany]);

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const payload = mode === 'create'
        ? await adminServiceApi.createEquipment({
          ...form,
          equipmentId: form.ownerType === 'company' ? form.internalNumber?.trim() : form.serial?.trim(),
          status: 'registered',
          currentStatusRaw: 'registered',
        })
        : await adminServiceApi.intakeCreate({
        ...form,
        equipmentId: form.ownerType === 'company' ? form.internalNumber?.trim() : form.serial?.trim(),
        serviceStatus: 'accepted',
        status: 'accepted',
        type: 'service',
      });
      const equipmentId = payload?.item?.equipment?.id;
      const serviceCaseId = payload?.item?.serviceCase?.id;
      if (mode !== 'create' && equipmentId && mediaFiles.length) {
        await adminServiceApi.uploadEquipmentMedia(equipmentId, mediaFiles, { serviceCaseId, caption: 'Intake media' });
      }
      setResult(payload?.item || null);
    } catch (e) {
      setError(e?.message || 'Не удалось завершить intake flow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="equipment-ops-page">
      <header className="service-headline">
        <div>
          <h2>{mode === 'create' ? 'Добавить оборудование' : 'Intake Wizard (legacy-compatible)'}</h2>
          <p>{mode === 'create' ? 'Быстрое создание Equipment card без запуска сервисного кейса.' : 'Пошаговый прием оборудования в стиле legacy PWA без радикального изменения порядка работы.'}</p>
        </div>
      </header>

      <div className="equipment-tabs">
        {STEPS.map((label, index) => (
          <button key={label} type="button" className={index === step ? 'active' : ''} onClick={() => setStep(index)}>{index + 1}. {label}</button>
        ))}
      </div>

      {!result ? (
        <article className="equipment-detail-section">
          {step === 0 ? (
            <>
              <h4>Кто владелец техники?</h4>
              <select value={form.ownerType} onChange={(e) => setForm((p) => ({ ...p, ownerType: e.target.value }))}>
                <option value="client">Оборудование клиента</option>
                <option value="company">Оборудование компании</option>
              </select>
              <p className="empty-copy">
                {isCompany
                  ? 'Форма компании: локация, название техники, внутренний номер, задача/комментарий.'
                  : 'Форма клиента: клиент, телефон, точка, модель, серийный номер, проблема и состояние.'}
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h4>Тип оборудования</h4>
              <select value={form.equipmentType} onChange={(e) => setForm((p) => ({ ...p, equipmentType: e.target.value }))}>
                <option value="grinder">Grinder</option>
                <option value="pro_coffee">Pro coffee</option>
                <option value="auto_coffee">Auto coffee</option>
                <option value="filter_system">Filter system</option>
              </select>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h4>{isCompany ? 'Идентификация оборудования компании' : 'Идентификация оборудования клиента'}</h4>
              {isClient ? (
                <>
                  <input value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} placeholder="Имя клиента" />
                  <input value={form.clientPhone} onChange={(e) => setForm((p) => ({ ...p, clientPhone: e.target.value }))} placeholder="Телефон" />
                  <input value={form.clientLocation} onChange={(e) => setForm((p) => ({ ...p, clientLocation: e.target.value }))} placeholder="Адрес / локация" />
                  <input value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} placeholder="Бренд" />
                  <input value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} placeholder="Модель" />
                  <input value={form.serial} onChange={(e) => setForm((p) => ({ ...p, serial: e.target.value }))} placeholder="Серийный номер" />
                </>
              ) : (
                <>
                  <input value={form.companyLocation} onChange={(e) => setForm((p) => ({ ...p, companyLocation: e.target.value }))} placeholder="Локация компании / точка" />
                  <input value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} placeholder="Бренд или тип техники" />
                  <input value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} placeholder="Название / модель" />
                  <input value={form.internalNumber} onChange={(e) => setForm((p) => ({ ...p, internalNumber: e.target.value }))} placeholder="Внутренний номер" />
                </>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h4>Комплектность и состояние</h4>
              <textarea value={form.damageDescription} onChange={(e) => setForm((p) => ({ ...p, damageDescription: e.target.value }))} placeholder="Опишите состояние, дефекты, комплектность" rows={4} />
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h4>{isCompany ? 'Задача / комментарий по оборудованию компании' : 'Проблема клиента'}</h4>
              <textarea value={form.problemDescription} onChange={(e) => setForm((p) => ({ ...p, problemDescription: e.target.value }))} placeholder={isCompany ? 'Задача / проблема: после аренды, подготовка, ремонт, ТО' : 'Что не работает / что запросил клиент'} rows={4} />
              <textarea value={form.intakeComment} onChange={(e) => setForm((p) => ({ ...p, intakeComment: e.target.value }))} placeholder="Комментарий при приёме" rows={3} />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <h4>Фото/видео</h4>
              <input type="file" accept="image/*,video/*" multiple onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
              <p>Файлов выбрано: {mediaFiles.length}</p>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <h4>Финал</h4>
              <p>Будут созданы: Equipment + ServiceCase + History {mediaFiles.length ? '+ Media' : ''}.</p>
              <p><strong>{form.brand || '—'} {form.model || ''}</strong> · владелец: {form.ownerType} · тип: {form.equipmentType}</p>
            </>
          ) : null}

          <div className="quick-filter-row">
            <button type="button" disabled={step <= 0 || saving} onClick={() => setStep((p) => Math.max(0, p - 1))}>Назад</button>
            {!isFinal ? <button type="button" disabled={!canNext || saving} onClick={() => setStep((p) => Math.min(STEPS.length - 1, p + 1))}>Далее</button> : null}
            {isFinal ? <button type="button" disabled={saving} onClick={() => submit()}>{saving ? 'Создаём...' : 'Завершить прием'}</button> : null}
            <button type="button" onClick={() => navigate(`${basePath}/equipment`)}>Отмена</button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </article>
      ) : (
        <article className="equipment-detail-section">
          <h4>Intake завершен</h4>
          <p>Equipment: {result?.equipment?.id}</p>
          <p>ServiceCase: {result?.serviceCase?.id}</p>
          <div className="quick-filter-row">
            <button type="button" onClick={() => navigate(`${basePath}/equipment/${result?.equipment?.id}`)}>Открыть карточку</button>
            <button type="button" onClick={() => navigate(`${basePath}/equipment`)}>В список</button>
          </div>
        </article>
      )}
    </section>
  );
}
