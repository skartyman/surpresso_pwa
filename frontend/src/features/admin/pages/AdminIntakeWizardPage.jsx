import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';

const STEPS = [
  'Владелец',
  'Тип оборудования',
  'Идентификация',
  'Состояние',
  'Задача',
  'Фото/видео',
  'Проверка',
];

const EQUIPMENT_TYPE_LABELS = {
  grinder: 'Кофемолка',
  pro_coffee: 'Профессиональная кофемашина',
  auto_coffee: 'Автоматическая кофемашина',
  filter_system: 'Фильтр / система воды',
  boiler: 'Бойлер / нагреватель',
  other: 'Другое оборудование',
};

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

function normalizeIntakePayload(form, mode) {
  const equipmentLabel = EQUIPMENT_TYPE_LABELS[form.equipmentType] || form.equipmentType;
  const ownerType = form.ownerType === 'company' ? 'company' : 'client';
  const fallbackBrand = form.brand.trim() || equipmentLabel;
  return {
    ...form,
    ownerType,
    name: form.name?.trim() || equipmentLabel,
    brand: fallbackBrand,
    model: form.model.trim() || null,
    serial: ownerType === 'client' ? form.serial.trim() : null,
    internalNumber: ownerType === 'company' ? form.internalNumber.trim() : null,
    clientName: ownerType === 'client' ? form.clientName.trim() : 'Surpresso',
    clientPhone: ownerType === 'client' ? form.clientPhone.trim() : '',
    clientLocation: ownerType === 'client' ? form.clientLocation.trim() : '',
    companyLocation: ownerType === 'company' ? (form.companyLocation.trim() || 'Surpresso') : '',
    equipmentId: ownerType === 'company' ? form.internalNumber.trim() : form.serial.trim(),
    status: mode === 'create' ? 'registered' : 'accepted',
    currentStatusRaw: mode === 'create' ? 'registered' : 'accepted',
    serviceStatus: mode === 'create' ? null : 'accepted',
    type: 'service',
  };
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
    name: '',
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
  const equipmentTypeLabel = EQUIPMENT_TYPE_LABELS[form.equipmentType] || form.equipmentType;
  const canNext = useMemo(() => {
    if (step === 2 && isClient) return Boolean(form.clientName.trim()) && Boolean(form.model.trim()) && Boolean(form.serial.trim());
    if (step === 2 && isCompany) return Boolean(form.internalNumber.trim()) && (Boolean(form.brand.trim()) || Boolean(form.model.trim()));
    if (step === 4 && isClient) return Boolean(form.problemDescription.trim());
    if (step === 4 && isCompany) return Boolean(form.problemDescription.trim()) || Boolean(form.intakeComment.trim());
    return true;
  }, [step, form, isClient, isCompany]);

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const payload = normalizeIntakePayload(form, mode);
      const response = mode === 'create'
        ? await adminServiceApi.createEquipment(payload)
        : await adminServiceApi.intakeCreate(payload);
      const equipmentId = response?.item?.equipment?.id;
      const serviceCaseId = response?.item?.serviceCase?.id;
      if (mode !== 'create' && equipmentId && mediaFiles.length) {
        await adminServiceApi.uploadEquipmentMedia(equipmentId, mediaFiles, { serviceCaseId, caption: 'Прием оборудования' });
      }
      setResult(response?.item || null);
    } catch (e) {
      setError(e?.message || 'Не удалось завершить прием оборудования');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="equipment-ops-page">
      <header className="service-headline">
        <div>
          <h2>{mode === 'create' ? 'Добавить оборудование' : 'Прием оборудования'}</h2>
          <p>{mode === 'create' ? 'Создание карточки без сервисного кейса.' : 'Карточка оборудования, сервисный кейс, история и уведомление в Telegram.'}</p>
        </div>
      </header>

      <article className="detail-section-card">
        <strong>Шаг {step + 1} из {STEPS.length}</strong>
        <p>{STEPS[step]}</p>
      </article>

      {!result ? (
        <article className="equipment-detail-section">
          {step === 0 ? (
            <>
              <h4>Кому принадлежит оборудование?</h4>
              <select value={form.ownerType} onChange={(e) => setForm((p) => ({ ...p, ownerType: e.target.value }))}>
                <option value="client">Оборудование клиента</option>
                <option value="company">Оборудование компании</option>
              </select>
              <p className="empty-copy">
                {isCompany
                  ? 'Для техники компании используем внутренний номер. Если техника в мастерской, точка будет Surpresso.'
                  : 'Для техники клиента используем серийный номер и сохраняем клиента, телефон и точку.'}
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h4>Тип оборудования</h4>
              <select value={form.equipmentType} onChange={(e) => setForm((p) => ({ ...p, equipmentType: e.target.value }))}>
                {Object.entries(EQUIPMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="empty-copy">В карточку попадет: {equipmentTypeLabel}</p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h4>{isCompany ? 'Карточка оборудования компании' : 'Карточка оборудования клиента'}</h4>
              {isClient ? (
                <>
                  <input value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} placeholder="Клиент / заведение" />
                  <input value={form.clientPhone} onChange={(e) => setForm((p) => ({ ...p, clientPhone: e.target.value }))} placeholder="Телефон" />
                  <input value={form.clientLocation} onChange={(e) => setForm((p) => ({ ...p, clientLocation: e.target.value }))} placeholder="Адрес / точка" />
                  <input value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} placeholder="Название / бренд" />
                  <input value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} placeholder="Модель" />
                  <input value={form.serial} onChange={(e) => setForm((p) => ({ ...p, serial: e.target.value }))} placeholder="Серийный номер" />
                </>
              ) : (
                <>
                  <input value={form.companyLocation} onChange={(e) => setForm((p) => ({ ...p, companyLocation: e.target.value }))} placeholder="Локация компании / точка" />
                  <input value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} placeholder="Название / бренд" />
                  <input value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} placeholder="Модель" />
                  <input value={form.internalNumber} onChange={(e) => setForm((p) => ({ ...p, internalNumber: e.target.value }))} placeholder="Внутренний номер" />
                </>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h4>Состояние и комплектность</h4>
              <textarea value={form.damageDescription} onChange={(e) => setForm((p) => ({ ...p, damageDescription: e.target.value }))} placeholder="Состояние, дефекты, комплектность" rows={4} />
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h4>{isCompany ? 'Задача / комментарий' : 'Проблема клиента'}</h4>
              <textarea value={form.problemDescription} onChange={(e) => setForm((p) => ({ ...p, problemDescription: e.target.value }))} placeholder={isCompany ? 'Что нужно сделать: ремонт, ТО, подготовка, после аренды' : 'Что не работает / что просит клиент'} rows={4} />
              <textarea value={form.intakeComment} onChange={(e) => setForm((p) => ({ ...p, intakeComment: e.target.value }))} placeholder="Комментарий при приеме" rows={3} />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <h4>Фото/видео</h4>
              <input type="file" accept="image/*,video/*" multiple onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
              <p>Выбрано файлов: {mediaFiles.length}</p>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <h4>Проверка</h4>
              <p>Будут созданы: карточка оборудования, сервисный кейс, история перемещения{mediaFiles.length ? ', медиафайлы' : ''}.</p>
              <p><strong>{form.brand || equipmentTypeLabel} {form.model || ''}</strong> · {isCompany ? `внутренний номер: ${form.internalNumber || '—'}` : `серийный: ${form.serial || '—'}`}</p>
              <p>{isCompany ? 'Владелец: компания Surpresso' : `Клиент: ${form.clientName || '—'}`}</p>
            </>
          ) : null}

          <div className="quick-filter-row">
            <button type="button" disabled={step <= 0 || saving} onClick={() => setStep((p) => Math.max(0, p - 1))}>Назад</button>
            {!isFinal ? <button type="button" disabled={!canNext || saving} onClick={() => setStep((p) => Math.min(STEPS.length - 1, p + 1))}>Далее</button> : null}
            {isFinal ? <button type="button" disabled={saving} onClick={() => submit()}>{saving ? 'Создаем...' : 'Завершить прием'}</button> : null}
            <button type="button" onClick={() => navigate(`${basePath}/equipment`)}>Отмена</button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </article>
      ) : (
        <article className="equipment-detail-section">
          <h4>Прием завершен</h4>
          <p>Equipment: {result?.equipment?.id}</p>
          <p>ServiceCase: {result?.serviceCase?.id || '—'}</p>
          {result?.telegram ? <p>Telegram: {result.telegram.sent || 0}/{result.telegram.total || 0}</p> : null}
          <div className="quick-filter-row">
            <button type="button" onClick={() => navigate(`${basePath}/equipment/${result?.equipment?.id}`)}>Открыть карточку</button>
            <button type="button" onClick={() => navigate(`${basePath}/equipment`)}>В список</button>
          </div>
        </article>
      )}
    </section>
  );
}
