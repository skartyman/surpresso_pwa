const DIAGRAMS_CATEGORIES = window.DIAGRAMS_CATEGORIES || [];

function createCategoryCard(category) {
  const card = document.createElement("a");
  card.className = `diagram-category-card${category.enabled ? "" : " is-disabled"}`;

  if (category.enabled && category.page) {
    card.href = category.page;
  } else {
    card.href = "#";
    card.setAttribute("aria-disabled", "true");
  }

  const badge = category.enabled ? "Доступно" : "Скоро";

  card.innerHTML = `
    <div class="diagram-category-card__top">
      <span class="diagram-category-card__icon" aria-hidden="true">${category.icon || "📁"}</span>
      <span class="status-badge">${badge}</span>
    </div>
    <h3>${category.title}</h3>
    <p>${category.description || ""}</p>
  `;

  if (!category.enabled) {
    card.addEventListener("click", event => event.preventDefault());
  }

  return card;
}

function renderCategories() {
  const grid = document.getElementById("diagram-categories-grid");
  if (!grid) return;

  grid.innerHTML = "";
  DIAGRAMS_CATEGORIES.forEach(category => {
    grid.appendChild(createCategoryCard(category));
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderCategories();
});
