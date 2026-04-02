export function AdminPlaceholderPage({ title, items }) {
  return (
    <section className="admin-page">
      <h1>{title}</h1>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
