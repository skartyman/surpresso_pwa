import { useEffect, useState } from 'react';
import { adminEmployeesApi } from '../api/adminEmployeesApi';
import { ROLES, ROLE_LABELS } from '../roleConfig';

const ROLE_OPTIONS = Object.values(ROLES);

const DEFAULT_FORM = {
  fullName: '',
  email: '',
  phone: '',
  role: ROLES.serviceEngineer,
  positionTitle: '',
  password: '',
};

export function AdminEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ q: '', role: '', isActive: '' });
  const [createMode, setCreateMode] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    const payload = await adminEmployeesApi.list(filters);
    setEmployees(payload.users || []);
    if (!selected && payload.users?.length) {
      setSelected(payload.users[0]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters(event) {
    const next = { ...filters, [event.target.name]: event.target.value };
    setFilters(next);
    const payload = await adminEmployeesApi.list(next);
    setEmployees(payload.users || []);
  }

  async function openCard(id) {
    const payload = await adminEmployeesApi.byId(id);
    setSelected(payload.user || null);
    setCreateMode(false);
  }

  async function saveCreate() {
    setSaving(true);
    try {
      await adminEmployeesApi.create(form);
      setForm(DEFAULT_FORM);
      setCreateMode(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveUpdate() {
    if (!selected) return;
    setSaving(true);
    try {
      const { user } = await adminEmployeesApi.update(selected.id, {
        fullName: selected.fullName,
        email: selected.email,
        phone: selected.phone,
        role: selected.role,
        positionTitle: selected.positionTitle,
        isActive: selected.isActive,
      });
      setSelected(user);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-service-page">
      <header className="admin-service-page__header">
        <h1>Сотрудники</h1>
        <button type="button" onClick={() => { setCreateMode(true); setSelected(null); }}>Создать сотрудника</button>
      </header>

      <div className="admin-filters-grid admin-filters-grid--employees">
        <label>
          <span>Поиск</span>
          <input name="q" value={filters.q} onChange={applyFilters} placeholder="ФИО, email, телефон" />
        </label>
        <label>
          <span>Роль</span>
          <select name="role" value={filters.role} onChange={applyFilters}>
            <option value="">Все роли</option>
            {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </label>
        <label>
          <span>Активность</span>
          <select name="isActive" value={filters.isActive} onChange={applyFilters}>
            <option value="">Все</option>
            <option value="true">Активные</option>
            <option value="false">Неактивные</option>
          </select>
        </label>
      </div>

      <div className="admin-service-grid">
        <div className="admin-service-list">
          {employees.map((employee) => (
            <button key={employee.id} type="button" className={`admin-service-list__item ${selected?.id === employee.id ? 'active' : ''}`} onClick={() => openCard(employee.id)}>
              <strong>{employee.fullName}</strong>
              <span>{employee.positionTitle || '—'}</span>
              <small>{ROLE_LABELS[employee.role] || employee.role}</small>
              <small>{employee.isActive ? 'Активен' : 'Отключен'}</small>
            </button>
          ))}
        </div>

        <article className="admin-service-detail">
          {createMode ? (
            <>
              <h2>Новый сотрудник</h2>
              <div className="admin-detail-grid">
                <label><span>ФИО</span><input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} /></label>
                <label><span>Email</span><input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></label>
                <label><span>Телефон</span><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
                <label><span>Должность</span><input value={form.positionTitle} onChange={(e) => setForm((p) => ({ ...p, positionTitle: e.target.value }))} /></label>
                <label>
                  <span>Роль</span>
                  <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </label>
                <label><span>Пароль</span><input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} /></label>
              </div>
              <button type="button" onClick={saveCreate} disabled={saving}>Создать</button>
            </>
          ) : selected ? (
            <>
              <h2>Карточка сотрудника</h2>
              <div className="admin-detail-grid">
                <label><span>ФИО</span><input value={selected.fullName || ''} onChange={(e) => setSelected((p) => ({ ...p, fullName: e.target.value }))} /></label>
                <label><span>Email</span><input value={selected.email || ''} onChange={(e) => setSelected((p) => ({ ...p, email: e.target.value }))} /></label>
                <label><span>Телефон</span><input value={selected.phone || ''} onChange={(e) => setSelected((p) => ({ ...p, phone: e.target.value }))} /></label>
                <label><span>Должность</span><input value={selected.positionTitle || ''} onChange={(e) => setSelected((p) => ({ ...p, positionTitle: e.target.value }))} /></label>
                <label>
                  <span>Роль</span>
                  <select value={selected.role} onChange={(e) => setSelected((p) => ({ ...p, role: e.target.value }))}>
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </label>
                <label>
                  <span>Статус</span>
                  <select value={selected.isActive ? 'true' : 'false'} onChange={(e) => setSelected((p) => ({ ...p, isActive: e.target.value === 'true' }))}>
                    <option value="true">Активен</option>
                    <option value="false">Отключен</option>
                  </select>
                </label>
              </div>
              <button type="button" onClick={saveUpdate} disabled={saving}>Сохранить</button>
            </>
          ) : <p>Выберите сотрудника или создайте нового.</p>}
        </article>
      </div>
    </section>
  );
}
