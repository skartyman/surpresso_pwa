import { useEffect, useMemo, useState } from 'react';
import { adminEmployeesApi } from '../api/adminEmployeesApi';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLE_LABELS, ROLES } from '../roleConfig';
import { useAuth } from '../../auth/AuthContext';

const WORK_MODE_OPTIONS = [
  { key: 'field', label: 'Выездной' },
  { key: 'inhouse', label: 'В мастерской' },
  { key: 'hybrid', label: 'Гибридный' },
];

const DEFAULT_FORM = {
  fullName: '',
  email: '',
  role: ROLES.serviceEngineer,
  positionTitle: 'Сервисный инженер',
  password: '',
  isActive: true,
  phone: '',
  notes: '',
  workMode: 'hybrid',
  capacity: 6,
  maxCritical: 2,
  priorityWeight: 0,
  canTakeUrgent: true,
  canTakeFieldRequests: false,
  specializations: [],
  brands: [],
  zones: [],
};

function pickLoadTone(employee) {
  if (!employee?.isActive) return 'inactive';
  const load = Number(employee.activeCount || 0) / Math.max(Number(employee.capacity || 6), 1);
  if (load >= 1) return 'high';
  if (load >= 0.65) return 'medium';
  return 'low';
}

function cloneForEdit(user = {}) {
  return {
    ...DEFAULT_FORM,
    ...user,
    specializations: [...(user.specializations || [])],
    brands: [...(user.brands || [])],
    zones: [...(user.zones || [])],
  };
}

export function AdminEmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ q: '', role: '', isActive: '' });
  const [lookups, setLookups] = useState({ specializations: [], brands: [], zones: [] });
  const [createMode, setCreateMode] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [serviceKpi, setServiceKpi] = useState(null);
  const isEngineer = user?.role === ROLES.serviceEngineer;
  const canEdit = [ROLES.owner, ROLES.director, ROLES.serviceHead, ROLES.manager].includes(user?.role);

  const roleOptions = useMemo(() => Object.values(ROLES), []);

  async function load(query = filters) {
    const [usersPayload, specializationsPayload, brandsPayload, zonesPayload, serviceKpiPayload] = await Promise.all([
      adminEmployeesApi.list(query),
      adminEmployeesApi.specializations(),
      adminEmployeesApi.brands(),
      adminEmployeesApi.zones(),
      adminServiceApi.serviceKpi().catch(() => null),
    ]);

    const users = usersPayload.users || [];
    setEmployees(users);
    setLookups({
      specializations: specializationsPayload.items || [],
      brands: brandsPayload.items || [],
      zones: zonesPayload.items || [],
    });
    setServiceKpi(serviceKpiPayload);

    if (!selected && users.length) {
      setSelected(cloneForEdit(users[0]));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters(event) {
    const next = { ...filters, [event.target.name]: event.target.value };
    setFilters(next);
    await load(next);
  }

  async function openCard(id) {
    const payload = await adminEmployeesApi.byId(id);
    setSelected(cloneForEdit(payload.user || null));
    setCreateMode(false);
  }

  function toggleArrayField(field, value) {
    const current = createMode ? form : selected;
    const setter = createMode ? setForm : setSelected;
    const hasValue = (current?.[field] || []).includes(value);
    setter((prev) => ({
      ...prev,
      [field]: hasValue ? prev[field].filter((item) => item !== value) : [...prev[field], value],
    }));
  }

  async function saveCreate() {
    setSaving(true);
    try {
      await adminEmployeesApi.create(form);
      setCreateMode(false);
      setForm(DEFAULT_FORM);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveUpdate() {
    if (!selected) return;
    setSaving(true);
    try {
      const { user: next } = await adminEmployeesApi.update(selected.id, selected);
      setSelected(cloneForEdit(next));
      await load();
    } finally {
      setSaving(false);
    }
  }

  const current = createMode ? form : selected;
  const workloadByUserId = useMemo(() => {
    const rows = serviceKpi?.roleAnalytics?.service?.engineerWorkload || [];
    return rows.reduce((acc, row) => {
      acc[row.userId] = row;
      return acc;
    }, {});
  }, [serviceKpi]);

  const avgAssignMinutes = serviceKpi?.roleAnalytics?.service?.avgAssignTimeMinutes ?? null;
  const avgRepairMinutes = serviceKpi?.roleAnalytics?.service?.avgRepairTimeMinutes ?? null;
  const summary = useMemo(() => {
    const team = employees.length;
    const active = employees.filter((item) => item.isActive).length;
    const activeCases = employees.reduce((sum, item) => sum + Number(item.activeCount || 0), 0);
    const overdue = employees.reduce((sum, item) => sum + Number(item.overdueCount || 0), 0);
    return { team, active, activeCases, overdue };
  }, [employees]);

  function formatMinutes(value) {
    return Number.isFinite(value) ? `${Math.round(value)} мин` : '—';
  }

  return (
    <section className="employees-page">
      <header className="employees-topbar">
        <div>
          <h2>Сотрудники / Команда сервиса</h2>
          <p>Профили инженеров, специализации, зоны выезда и правила нагрузки.</p>
        </div>
        {canEdit ? <button type="button" onClick={() => { setCreateMode(true); setSelected(null); }}>Добавить сотрудника</button> : null}
      </header>

      <div className="employees-filters">
        <label><span>Поиск</span><input name="q" value={filters.q} onChange={applyFilters} placeholder="ФИО, email, телефон" /></label>
        <label>
          <span>Роль</span>
          <select name="role" value={filters.role} onChange={applyFilters}>
            <option value="">Все роли</option>
            {roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select name="isActive" value={filters.isActive} onChange={applyFilters}>
            <option value="">Все</option>
            <option value="true">Активные</option>
            <option value="false">Неактивные</option>
          </select>
        </label>
      </div>

      <section className="employees-kpi-strip">
        <article><span>Сотрудников</span><strong>{summary.team}</strong></article>
        <article><span>Активных</span><strong>{summary.active}</strong></article>
        <article><span>Активные кейсы</span><strong>{summary.activeCases}</strong></article>
        <article><span>Просрочки</span><strong>{summary.overdue}</strong></article>
        <article><span>Ср. назначение</span><strong>{formatMinutes(avgAssignMinutes)}</strong></article>
        <article><span>Ср. ремонт / обработка</span><strong>{formatMinutes(avgRepairMinutes)}</strong></article>
      </section>

      <div className="employees-workspace">
        <aside className="employees-list">
          {employees.map((employee) => (
            <button key={employee.id} type="button" className={`employee-card ${selected?.id === employee.id ? 'active' : ''}`} onClick={() => openCard(employee.id)}>
              <div className="employee-card__top">
                <strong>{employee.fullName}</strong>
                <em data-tone={pickLoadTone(employee)}>{employee.isActive ? 'Активен' : 'Неактивен'}</em>
              </div>
              <small>{ROLE_LABELS[employee.role] || employee.role}</small>
              <p>{(employee.specializations || []).join(', ') || 'Без специализаций'}</p>
              <div className="employee-card__metrics">
                <span>Активность: {employee.isActive ? 'Да' : 'Нет'}</span>
                <span>Нагрузка: {employee.activeCount || 0}/{employee.capacity || 6}</span>
                <span>Кейсы: {(workloadByUserId[employee.id]?.activeCases ?? employee.activeCount) || 0}</span>
                <span>Просрочки: {employee.overdueCount || 0}</span>
                <span>Критические: {employee.criticalCount || 0}</span>
                <span>KPI: закрыто сегодня {employee.resolvedTodayCount || 0}</span>
              </div>
            </button>
          ))}
        </aside>

        <article className="employees-detail">
          {!current ? <p>Выберите сотрудника из списка.</p> : (
            <>
              <h3>{createMode ? 'Новый сотрудник' : 'Профиль сотрудника'}</h3>

              <section className="employees-form-section">
                <h4>Основное</h4>
                <div className="employees-grid">
                  <label><span>ФИО</span><input value={current.fullName || ''} onChange={(e) => (createMode ? setForm((p) => ({ ...p, fullName: e.target.value })) : setSelected((p) => ({ ...p, fullName: e.target.value })))} /></label>
                  <label><span>Email</span><input value={current.email || ''} onChange={(e) => (createMode ? setForm((p) => ({ ...p, email: e.target.value })) : setSelected((p) => ({ ...p, email: e.target.value })))} /></label>
                  <label><span>Роль</span><select value={current.role || ''} disabled={!canEdit || isEngineer} onChange={(e) => (createMode ? setForm((p) => ({ ...p, role: e.target.value })) : setSelected((p) => ({ ...p, role: e.target.value })))}>{roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
                  <label><span>Статус</span><select value={current.isActive ? 'true' : 'false'} disabled={!canEdit} onChange={(e) => (createMode ? setForm((p) => ({ ...p, isActive: e.target.value === 'true' })) : setSelected((p) => ({ ...p, isActive: e.target.value === 'true' })))}><option value="true">Активен</option><option value="false">Неактивен</option></select></label>
                  <label><span>Телефон</span><input value={current.phone || ''} onChange={(e) => (createMode ? setForm((p) => ({ ...p, phone: e.target.value })) : setSelected((p) => ({ ...p, phone: e.target.value })))} /></label>
                  <label><span>Примечания</span><input value={current.notes || ''} onChange={(e) => (createMode ? setForm((p) => ({ ...p, notes: e.target.value })) : setSelected((p) => ({ ...p, notes: e.target.value })))} /></label>
                  {createMode ? <label><span>Пароль</span><input type="password" value={current.password || ''} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} /></label> : null}
                </div>
              </section>

              <section className="employees-form-section">
                <h4>Формат работы</h4>
                <div className="chips-row">{WORK_MODE_OPTIONS.map((mode) => <button type="button" key={mode.key} className={`chip ${current.workMode === mode.key ? 'active' : ''}`} onClick={() => (createMode ? setForm((p) => ({ ...p, workMode: mode.key })) : setSelected((p) => ({ ...p, workMode: mode.key })))}>{mode.label}</button>)}</div>
              </section>

              <section className="employees-form-section">
                <h4>Специализации</h4>
                <div className="chips-row">{lookups.specializations.map((key) => <button key={key} type="button" className={`chip ${(current.specializations || []).includes(key) ? 'active' : ''}`} onClick={() => toggleArrayField('specializations', key)}>{key}</button>)}</div>
              </section>

              <section className="employees-form-section">
                <h4>Бренды</h4>
                <div className="chips-row">{lookups.brands.map((key) => <button key={key} type="button" className={`chip ${(current.brands || []).includes(key) ? 'active' : ''}`} onClick={() => toggleArrayField('brands', key)}>{key}</button>)}</div>
              </section>

              <section className="employees-form-section">
                <h4>Выездные зоны</h4>
                <div className="chips-row">{lookups.zones.map((key) => <button key={key} type="button" className={`chip ${(current.zones || []).includes(key) ? 'active' : ''}`} onClick={() => toggleArrayField('zones', key)}>{key}</button>)}</div>
              </section>

              <section className="employees-form-section">
                <h4>Нагрузка и правила</h4>
                <div className="employees-grid">
                  <label><span>Capacity</span><input type="number" value={current.capacity ?? 6} onChange={(e) => (createMode ? setForm((p) => ({ ...p, capacity: Number(e.target.value) })) : setSelected((p) => ({ ...p, capacity: Number(e.target.value) })))} /></label>
                  <label><span>Max critical</span><input type="number" value={current.maxCritical ?? 2} onChange={(e) => (createMode ? setForm((p) => ({ ...p, maxCritical: Number(e.target.value) })) : setSelected((p) => ({ ...p, maxCritical: Number(e.target.value) })))} /></label>
                  <label><span>Priority weight</span><input type="number" value={current.priorityWeight ?? 0} onChange={(e) => (createMode ? setForm((p) => ({ ...p, priorityWeight: Number(e.target.value) })) : setSelected((p) => ({ ...p, priorityWeight: Number(e.target.value) })))} /></label>
                  <label><span>Urgent</span><select value={current.canTakeUrgent ? 'true' : 'false'} onChange={(e) => (createMode ? setForm((p) => ({ ...p, canTakeUrgent: e.target.value === 'true' })) : setSelected((p) => ({ ...p, canTakeUrgent: e.target.value === 'true' })))}><option value="true">Да</option><option value="false">Нет</option></select></label>
                  <label><span>Field requests</span><select value={current.canTakeFieldRequests ? 'true' : 'false'} onChange={(e) => (createMode ? setForm((p) => ({ ...p, canTakeFieldRequests: e.target.value === 'true' })) : setSelected((p) => ({ ...p, canTakeFieldRequests: e.target.value === 'true' })))}><option value="true">Да</option><option value="false">Нет</option></select></label>
                </div>
              </section>

              {(canEdit || (isEngineer && !createMode)) ? <button type="button" onClick={createMode ? saveCreate : saveUpdate} disabled={saving}>{createMode ? 'Создать' : 'Сохранить изменения'}</button> : null}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
