const DIAGRAMS_CATEGORIES = window.DIAGRAMS_CATEGORIES || [];

let brandSearchQuery = "";

function getCategoryById(categoryId) {
  return DIAGRAMS_CATEGORIES.find(category => category.id === categoryId) || null;
}

function openExternal(url) {
  if (!url) return;

  if (String(url).startsWith("/")) {
    window.location.href = url;
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function getFilteredBrands(category) {
  const items = Array.isArray(category?.items) ? category.items : [];
  const normalizedQuery = brandSearchQuery.trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items.filter(item => {
    const title = String(item.title || "").toLowerCase();
    const description = String(item.description || "").toLowerCase();
    return title.includes(normalizedQuery) || description.includes(normalizedQuery);
  });
}

function createBrandCard(brand) {
  const card = document.createElement("article");
  card.className = "diagram-brand-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Открыть схемы ${brand.title}`);

  card.innerHTML = `
    <div class="diagram-brand-card__head">
      <h3>${brand.title}</h3>
      <span class="diagram-favorite-stub" title="Быстрый переход">↗</span>
    </div>
    <p>${brand.description || ""}</p>
    <div class="diagram-brand-card__actions">
      <button type="button" class="btn primary js-open-diagrams">Открыть схемы</button>
      <button type="button" class="btn ghost js-open-browser">Открыть в браузере ↗</button>
    </div>
  `;

  const onOpen = () => openExternal(brand.url);

  card.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    onOpen();
  });

  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  });

  card.querySelector(".js-open-diagrams")?.addEventListener("click", onOpen);
  card.querySelector(".js-open-browser")?.addEventListener("click", onOpen);

  return card;
}

function renderCategoryPage() {
  const categoryId = document.body.dataset.category;
  const category = getCategoryById(categoryId);

  const titleNode = document.getElementById("diagram-active-category-title");
  const descriptionNode = document.getElementById("diagram-active-category-description");

  if (!category) {
    if (titleNode) titleNode.textContent = "Категория не найдена";
    if (descriptionNode) descriptionNode.textContent = "Проверьте ссылку на страницу категории.";
    return;
  }

  if (titleNode) titleNode.textContent = category.title;
  if (descriptionNode) descriptionNode.textContent = category.description || "Выберите источник схем.";

  const brandGrid = document.getElementById("diagram-brands-grid");
  const emptyState = document.getElementById("diagram-brands-empty");
  if (!brandGrid || !emptyState) return;

  const filteredItems = getFilteredBrands(category);
  brandGrid.innerHTML = "";

  if (!filteredItems.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  filteredItems.forEach(item => {
    brandGrid.appendChild(createBrandCard(item));
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderCategoryPage();

  const searchInput = document.getElementById("manufacturer-search");
  if (searchInput) {
    searchInput.value = "";
    searchInput.setAttribute("readonly", "readonly");
    searchInput.addEventListener("focus", () => {
      searchInput.removeAttribute("readonly");
    }, { once: true });
  }

  searchInput?.addEventListener("input", () => {
    brandSearchQuery = searchInput.value || "";
    renderCategoryPage();
  });
});
