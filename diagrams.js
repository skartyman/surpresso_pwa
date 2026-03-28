const DIAGRAMS_CATEGORIES = [
  {
    id: "automatic",
    title: "Автоматические кофемашины",
    description: "Каталог схем по автоматическим кофемашинам популярных брендов.",
    icon: "🤖",
    enabled: true,
    items: [
      {
        id: "delonghi",
        title: "DeLonghi",
        description: "Схемы и PDF по автоматическим кофемашинам DeLonghi (ESAM / ECAM / Magnifica и другие).",
        url: "https://espressodolce.ca/pages/delonghi-part-diagrams",
        favorite: false
      },
      {
        id: "saeco-philips",
        title: "Saeco / Philips",
        description: "Взрыв-схемы и документация по автоматическим кофемашинам Saeco и Philips.",
        url: "https://service-cm.ru/tekhnicheskaya-dokumentatsiya-dlya-kofemashin/detalirovochnye-vzryvnye-skhemy-kofemashin-saeco-philips",
        favorite: false
      }
    ]
  },
  {
    id: "professional",
    title: "Профессиональные кофемашины",
    description: "Раздел будет добавлен в следующих релизах.",
    icon: "☕",
    enabled: false,
    items: []
  },
  {
    id: "grinders",
    title: "Гриндеры",
    description: "Раздел будет добавлен в следующих релизах.",
    icon: "⚙️",
    enabled: false,
    items: []
  },
  {
    id: "filtration",
    title: "Системы фильтрации",
    description: "Раздел будет добавлен в следующих релизах.",
    icon: "💧",
    enabled: false,
    items: []
  }
];

const DIAGRAMS_FUTURE_FEATURES = {
  favorites: {
    enabled: false,
    note: "Задел под избранные бренды без хранения на текущем этапе"
  }
};

let activeCategoryId = null;
let brandSearchQuery = "";

function getCategoryById(categoryId) {
  return DIAGRAMS_CATEGORIES.find(category => category.id === categoryId) || null;
}

function openExternal(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function createCategoryCard(category) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `diagram-category-card${category.enabled ? "" : " is-disabled"}`;
  card.setAttribute("aria-disabled", String(!category.enabled));

  const badge = category.enabled ? "Доступно" : "Скоро";
  card.innerHTML = `
    <div class="diagram-category-card__top">
      <span class="diagram-category-card__icon" aria-hidden="true">${category.icon || "📁"}</span>
      <span class="status-badge">${badge}</span>
    </div>
    <h3>${category.title}</h3>
    <p>${category.description || ""}</p>
  `;

  if (category.enabled) {
    card.addEventListener("click", () => {
      showCategory(category.id);
    });
  } else {
    card.disabled = true;
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

function getFilteredBrands(category) {
  const items = Array.isArray(category?.items) ? category.items : [];
  const normalizedQuery = brandSearchQuery.trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items.filter(item => item.title.toLowerCase().includes(normalizedQuery));
}

function createBrandCard(brand) {
  const card = document.createElement("article");
  card.className = "diagram-brand-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Открыть схемы ${brand.title}`);

  const favoriteMark = DIAGRAMS_FUTURE_FEATURES.favorites.enabled ? "★" : "☆";

  card.innerHTML = `
    <div class="diagram-brand-card__head">
      <h3>${brand.title}</h3>
      <span class="diagram-favorite-stub" title="${DIAGRAMS_FUTURE_FEATURES.favorites.note}">${favoriteMark}</span>
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

function renderBrands() {
  const brandGrid = document.getElementById("diagram-brands-grid");
  const emptyState = document.getElementById("diagram-brands-empty");
  if (!brandGrid || !emptyState) return;

  const category = getCategoryById(activeCategoryId);
  const filteredItems = getFilteredBrands(category);

  brandGrid.innerHTML = "";

  if (!category || !filteredItems.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  filteredItems.forEach(item => {
    brandGrid.appendChild(createBrandCard(item));
  });
}

function showCategory(categoryId) {
  const category = getCategoryById(categoryId);
  if (!category || !category.enabled) return;

  activeCategoryId = category.id;
  brandSearchQuery = "";

  const categoriesSection = document.getElementById("diagram-categories-section");
  const brandsSection = document.getElementById("diagram-brands-section");
  const categoryTitle = document.getElementById("diagram-active-category-title");
  const categoryDescription = document.getElementById("diagram-active-category-description");
  const searchInput = document.getElementById("diagram-brand-search");

  if (categoryTitle) categoryTitle.textContent = category.title;
  if (categoryDescription) categoryDescription.textContent = "Выберите бренд и перейдите к деталировочным схемам.";
  if (searchInput) searchInput.value = "";

  categoriesSection?.setAttribute("hidden", "hidden");
  brandsSection?.removeAttribute("hidden");

  renderBrands();
}

function goBackToCategories() {
  activeCategoryId = null;
  brandSearchQuery = "";

  const categoriesSection = document.getElementById("diagram-categories-section");
  const brandsSection = document.getElementById("diagram-brands-section");
  categoriesSection?.removeAttribute("hidden");
  brandsSection?.setAttribute("hidden", "hidden");
}

window.addEventListener("DOMContentLoaded", () => {
  renderCategories();

  const backBtn = document.getElementById("diagram-back-btn");
  backBtn?.addEventListener("click", goBackToCategories);

  const searchInput = document.getElementById("diagram-brand-search");
  searchInput?.addEventListener("input", () => {
    brandSearchQuery = searchInput.value || "";
    renderBrands();
  });
});
