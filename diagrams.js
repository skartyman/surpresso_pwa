const DVG_DIAGRAMS_BASE = "https://devecchigiuseppesrl.com/e-commerce/cerca.asp";
const DVG_DIAGRAMS_SECTION = "COFFEE MACHINES - Diagrams";

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
  return `${DVG_DIAGRAMS_BASE}?c2=${encodeURIComponent(DVG_DIAGRAMS_SECTION)}&c3=${encodeURIComponent(brand)}`;
}

function renderDiagramBrands(items) {
  const grid = document.getElementById("diagram-grid");
  const empty = document.getElementById("diagram-empty");
  if (!grid || !empty) return;

  grid.innerHTML = "";

  if (!items.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  items.forEach(item => {
    const link = document.createElement("a");
    link.href = getDvgDiagramUrl(item.dvg);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "diagram-brand-link";
    link.textContent = item.name;
    grid.appendChild(link);
  });
}

function filterDiagramBrands(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return diagramBrands;
  return diagramBrands.filter(item => item.name.toLowerCase().includes(normalized));
}

window.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("diagram-search");
  if (!searchInput) return;

  renderDiagramBrands(diagramBrands);

  searchInput.addEventListener("input", () => {
    renderDiagramBrands(filterDiagramBrands(searchInput.value));
  });
});
