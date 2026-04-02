function getDvgCategoryUrl(categoryName) {
  return `https://devecchigiuseppesrl.com/e-commerce/cerca.asp?c2=${encodeURIComponent(categoryName)}`;
}

function getDvgCategoryBrandUrl(categoryName, brand) {
  return `${getDvgCategoryUrl(categoryName)}&c3=${encodeURIComponent(brand)}`;
}

function createDvgBrandLink(item, categoryName) {
  const link = document.createElement("a");
  link.href = getDvgCategoryBrandUrl(categoryName, item.dvg);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "diagram-brand-link";
  link.textContent = item.name;
  return link;
}

function filterDvgBrands(brands, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return brands;

  return brands.filter(item => String(item.name || "").toLowerCase().includes(normalized));
}

function renderDvgBrandCatalog(config) {
  const {
    categoryName,
    brands,
    title,
    subtitle,
    emptyMessage = "Ничего не найдено",
    searchLabel = "Поиск производителя",
    searchPlaceholder = "Введите название производителя"
  } = config;

  const titleNode = document.getElementById("diagram-active-category-title");
  const subtitleNode = document.getElementById("diagram-active-category-description");
  const openAllLink = document.getElementById("diagram-open-all-dvg");
  const searchLabelNode = document.getElementById("diagram-brand-search-label");
  const searchInput = document.getElementById("manufacturer-search");
  const grid = document.getElementById("diagram-brands-grid");
  const emptyState = document.getElementById("diagram-brands-empty");

  if (titleNode) titleNode.textContent = title;
  if (subtitleNode) subtitleNode.textContent = subtitle;
  if (openAllLink) openAllLink.href = getDvgCategoryUrl(categoryName);
  if (searchLabelNode) searchLabelNode.textContent = searchLabel;
  if (searchInput) {
    searchInput.placeholder = searchPlaceholder;
    searchInput.value = "";
    searchInput.setAttribute("readonly", "readonly");
    searchInput.addEventListener("focus", () => {
      searchInput.removeAttribute("readonly");
    }, { once: true });
  }
  if (emptyState) emptyState.textContent = emptyMessage;

  function draw(query = "") {
    if (!grid || !emptyState) return;

    const filtered = filterDvgBrands(brands, query);
    grid.innerHTML = "";

    if (!filtered.length) {
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    filtered.forEach(item => {
      grid.appendChild(createDvgBrandLink(item, categoryName));
    });
  }

  draw();

  searchInput?.addEventListener("input", event => {
    draw(event.target.value || "");
  });
}

window.renderDvgBrandCatalog = renderDvgBrandCatalog;
window.getDvgCategoryBrandUrl = getDvgCategoryBrandUrl;
