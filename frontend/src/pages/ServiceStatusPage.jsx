import { useParams } from 'react-router-dom';

export function ServiceStatusPage() {
  const { requestId } = useParams();

  return (
    <section>
      <h1>Статус заявки {requestId}</h1>
      <div className="status-card">
        <p>Текущий статус: В работе</p>
        <p>Инженер назначен, ожидаем подтверждение времени визита.</p>
      </div>
    </section>
  );
}
