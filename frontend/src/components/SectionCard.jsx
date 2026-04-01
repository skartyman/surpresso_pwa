import { Link } from 'react-router-dom';

export function SectionCard({ to, title, subtitle, action = 'Открыть' }) {
  return (
    <Link to={to} className="section-card">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span>{action}</span>
    </Link>
  );
}
