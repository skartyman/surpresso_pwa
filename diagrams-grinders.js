const grinderBrands = [
  { name: "Anfim", dvg: "Anfim" },
  { name: "Casadio", dvg: "Casadio" },
  { name: "Cimbali", dvg: "Cimbali" },
  { name: "Compak", dvg: "Compak" },
  { name: "Eureka", dvg: "Eureka" },
  { name: "Faema", dvg: "Faema" },
  { name: "Fiorenzato CS Doge", dvg: "Fiorenzato CS Doge" },
  { name: "Fiorenzato MC", dvg: "Fiorenzato MC" },
  { name: "La Marzocco", dvg: "La Marzocco" },
  { name: "Macap", dvg: "Macap" },
  { name: "Mahlkönig", dvg: "Mahlkönig" },
  { name: "Mazzer", dvg: "Mazzer" },
  { name: "Nuova Simonelli", dvg: "Nuova Simonelli" },
  { name: "Obel", dvg: "Obel" },
  { name: "Quamar", dvg: "Quamar" },
  { name: "Remidag", dvg: "Remidag" },
  { name: "Rossi", dvg: "Rossi" },
  { name: "Santos", dvg: "Santos" }
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
