const grinderBrands = [
  { name: "Anfim", dvg: "Anfim" },
  { name: "Ascaso", dvg: "Ascaso" },
  { name: "Astoria", dvg: "Astoria" },
  { name: "Baratza", dvg: "Baratza" },
  { name: "Brasilia-Rossi", dvg: "Brasilia-Rossi" },
  { name: "Casadio", dvg: "Casadio" },
  { name: "Ceado", dvg: "Ceado" },
  { name: "Cimbali", dvg: "Cimbali" },
  { name: "Compak", dvg: "Compak" },
  { name: "Cunill", dvg: "Cunill" },
  { name: "Ditting", dvg: "Ditting" },
  { name: "Eureka", dvg: "Eureka" },
  { name: "Faema", dvg: "Faema" },
  { name: "Fiorenzato", dvg: "Fiorenzato" },
  { name: "La Cimbali", dvg: "La Cimbali" },
  { name: "Macap", dvg: "Macap" },
  { name: "Mazzer", dvg: "Mazzer" },
  { name: "Nuova Simonelli", dvg: "Nuova Simonelli" },
  { name: "Obel", dvg: "Obel" },
  { name: "Quamar", dvg: "Quamar" },
  { name: "Rancilio", dvg: "Rancilio" },
  { name: "Rossi", dvg: "Rossi" },
  { name: "Sanremo", dvg: "Sanremo" },
  { name: "Victoria Arduino", dvg: "Victoria Arduino" }
];

function getDvgGrinderUrl(brand) {
  return `https://devecchigiuseppesrl.com/e-commerce/cerca.asp?c2=${encodeURIComponent("GRINDERS - Diagrams")}&c3=${encodeURIComponent(brand)}`;
}

window.getDvgGrinderUrl = getDvgGrinderUrl;

window.addEventListener("DOMContentLoaded", () => {
  window.renderDvgBrandCatalog?.({
    categoryName: "GRINDERS - Diagrams",
    brands: grinderBrands,
    title: "Схемы гриндеров",
    subtitle: "Выберите производителя",
    emptyMessage: "Ничего не найдено",
    searchLabel: "Поиск производителя",
    searchPlaceholder: "Введите название производителя"
  });
});
