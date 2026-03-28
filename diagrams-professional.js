const diagramBrands = [
  { name: "1-Universal", dvg: "1-Universal" },
  { name: "969 Coffee", dvg: "969 Coffee" },
  { name: "Astoria", dvg: "Astoria" },
  { name: "Aurora-Brugnetti", dvg: "Aurora-Brugnetti" },
  { name: "Bezzera", dvg: "Bezzera" },
  { name: "BFC-Royal", dvg: "BFC-Royal" },
  { name: "Biepi", dvg: "Biepi" },
  { name: "Brasilia-Rossi", dvg: "Brasilia-Rossi" },
  { name: "Carimali", dvg: "Carimali" },
  { name: "Casadio", dvg: "Casadio" },
  { name: "Cimbali", dvg: "Cimbali" },
  { name: "Cime", dvg: "Cime" },
  { name: "Conti Sacome", dvg: "Conti Sacome" },
  { name: "Crem Expobar", dvg: "Crem Expobar" },
  { name: "Dalla Corte", dvg: "Dalla Corte" },
  { name: "Elektra", dvg: "Elektra" },
  { name: "Eureka", dvg: "Eureka" },
  { name: "Faema", dvg: "Faema" },
  { name: "Futurmat", dvg: "Futurmat" },
  { name: "Gaggia", dvg: "Gaggia" },
  { name: "Grimac-Fiorenzato", dvg: "Grimac-Fiorenzato" },
  { name: "Gruppo Izzo - My way", dvg: "Gruppo Izzo - My way" },
  { name: "La Marzocco", dvg: "La Marzocco" },
  { name: "La Nuova Era", dvg: "La Nuova Era" },
  { name: "La Pavoni", dvg: "La Pavoni" },
  { name: "La Piccola", dvg: "La Piccola" },
  { name: "La San Marco", dvg: "La San Marco" },
  { name: "La Scala-Symphony", dvg: "La Scala-Symphony" },
  { name: "La Spaziale", dvg: "La Spaziale" },
  { name: "Lelit", dvg: "Lelit" },
  { name: "Nuova Simonelli", dvg: "Nuova Simonelli" },
  { name: "Orchestrale", dvg: "Orchestrale" },
  { name: "Ponte Vecchio", dvg: "Ponte Vecchio" },
  { name: "Profitec", dvg: "Profitec" },
  { name: "Quick Mill", dvg: "Quick Mill" },
  { name: "Rancilio - Promac", dvg: "Rancilio - Promac" },
  { name: "Rocket - ECM Italia", dvg: "Rocket - ECM Italia" },
  { name: "Sanremo", dvg: "Sanremo" },
  { name: "Slayer", dvg: "Slayer" },
  { name: "SV Sab Italia", dvg: "SV Sab Italia" },
  { name: "Synesso", dvg: "Synesso" },
  { name: "VBM", dvg: "VBM" },
  { name: "Victoria Arduino", dvg: "Victoria Arduino" },
  { name: "Wega", dvg: "Wega" },
  { name: "XLVI", dvg: "XLVI" }
];

function getDvgDiagramUrl(brand) {
  return `https://devecchigiuseppesrl.com/e-commerce/cerca.asp?c2=${encodeURIComponent("COFFEE MACHINES - Diagrams")}&c3=${encodeURIComponent(brand)}`;
}

function createBrandLink(item) {
  const link = document.createElement("a");
  link.href = getDvgDiagramUrl(item.dvg);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "diagram-brand-link";
  link.textContent = item.name;
  return link;
}

function filterBrands(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return diagramBrands;

  return diagramBrands.filter(item => item.name.toLowerCase().includes(normalized));
}

function renderBrands(query = "") {
  const grid = document.getElementById("diagram-brands-grid");
  const emptyState = document.getElementById("diagram-brands-empty");
  if (!grid || !emptyState) return;

  const filtered = filterBrands(query);
  grid.innerHTML = "";

  if (!filtered.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  filtered.forEach(item => {
    grid.appendChild(createBrandLink(item));
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderBrands();

  const searchInput = document.getElementById("diagram-brand-search");
  searchInput?.addEventListener("input", event => {
    renderBrands(event.target.value || "");
  });
});
