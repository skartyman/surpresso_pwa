import { useEffect, useState } from 'react';
import { adminCommunicationsApi } from '../api/adminCommunicationsApi';

export function AdminCommunicationsPage() {
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [segment, setSegment] = useState('all_clients');
  const [status, setStatus] = useState('');

  useEffect(() => {
    adminCommunicationsApi.templates().then((payload) => setTemplates(payload.templates || []));
  }, []);

  async function sendBroadcast() {
    await adminCommunicationsApi.broadcast({ message, templateId: templateId || null, audience: 'mini_app', segment });
    setStatus('Рассылка поставлена в очередь');
    setMessage('');
  }

  return (
    <section className="admin-page">
      <h1>Коммуникации</h1>
      <p>Массовые рассылки, сегментация и шаблоны для Mini App.</p>
      <select value={segment} onChange={(e) => setSegment(e.target.value)}>
        <option value="all_clients">Все клиенты</option>
        <option value="active_service">Только сервис</option>
        <option value="sales_pipeline">Продажи</option>
      </select>
      <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <option value="">Без шаблона</option>
        {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
      </select>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Текст сообщения" />
      <button type="button" onClick={sendBroadcast}>Отправить рассылку</button>
      {status ? <p className="notice notice-success">{status}</p> : null}
    </section>
  );
}
