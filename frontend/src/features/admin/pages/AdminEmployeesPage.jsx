import { useEffect, useState } from 'react';
import { adminEmployeesApi } from '../api/adminEmployeesApi';

const ROLES = ['service_engineer', 'service_head', 'sales_manager', 'owner', 'director'];

export function AdminEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'service_engineer', positionTitle: '' });

  async function load() {
    const payload = await adminEmployeesApi.list();
    setEmployees(payload.employees || []);
    if (!selectedId && payload.employees?.length) {
      setSelectedId(payload.employees[0].id);
    }
  }

  useEffect(() => { load(); }, []);

  const selected = employees.find((item) => item.id === selectedId) || null;

  async function createEmployee(event) {
    event.preventDefault();
    const result = await adminEmployeesApi.create(form);
    setTempPassword(result.tempPassword || '');
    setForm({ fullName: '', email: '', phone: '', role: 'service_engineer', positionTitle: '' });
    await load();
  }

  async function saveEmployee() {
    if (!selected) return;
    await adminEmployeesApi.update(selected.id, {
      fullName: selected.fullName,
      email: selected.email,
      phone: selected.phone,
      role: selected.role,
      positionTitle: selected.positionTitle,
    });
    await load();
  }

  async function toggleActive() {
    if (!selected) return;
    await adminEmployeesApi.setActive(selected.id, !selected.isActive);
    await load();
  }

  async function resetPassword() {
    if (!selected) return;
    const result = await adminEmployeesApi.resetPassword(selected.id);
    setTempPassword(result.tempPassword || '');
  }

  function updateSelected(field, value) {
    setEmployees((prev) => prev.map((item) => (item.id === selectedId ? { ...item, [field]: value } : item)));
  }

  return (
    <section className="admin-service-page">
      <header className="admin-service-page__header"><h1>Сотрудники</h1></header>
      {tempPassword ? <p className="notice notice-success">Временный пароль: <strong>{tempPassword}</strong></p> : null}
      <div className="admin-service-grid">
        <div className="admin-service-list">
          {employees.map((item) => (
            <button key={item.id} className={`admin-service-list__item ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
              <strong>{item.fullName}</strong>
              <span>{item.role}</span>
              <small>{item.isActive ? 'active' : 'disabled'}</small>
            </button>
          ))}
        </div>
        <div className="admin-service-detail">
          <section>
            <h3>Создать сотрудника</h3>
            <form className="admin-notes-form" onSubmit={createEmployee}>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="ФИО" required />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Телефон" />
              <input value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value })} placeholder="Должность" />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
              <button type="submit">Создать</button>
            </form>
          </section>
          {selected ? (
            <section>
              <h3>Редактирование</h3>
              <input value={selected.fullName || ''} onChange={(e) => updateSelected('fullName', e.target.value)} />
              <input value={selected.email || ''} onChange={(e) => updateSelected('email', e.target.value)} />
              <input value={selected.phone || ''} onChange={(e) => updateSelected('phone', e.target.value)} />
              <input value={selected.positionTitle || ''} onChange={(e) => updateSelected('positionTitle', e.target.value)} />
              <select value={selected.role} onChange={(e) => updateSelected('role', e.target.value)}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
              <div className="actions-row">
                <button type="button" onClick={saveEmployee}>Сохранить</button>
                <button type="button" className="secondary" onClick={toggleActive}>{selected.isActive ? 'Деактивировать' : 'Активировать'}</button>
                <button type="button" className="secondary" onClick={resetPassword}>Сбросить пароль</button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
