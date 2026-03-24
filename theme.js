(function () {
  function getStoredMode() {
    return localStorage.getItem("surp_theme") || "dark";
  }

  function getEffectiveMode(mode) {
    if (mode !== "auto") return mode;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function apply(mode) {
    const body = document.body;
    if (!body) return;

    const effective = getEffectiveMode(mode || getStoredMode());
    body.classList.toggle("theme-light", effective === "light");
    body.classList.toggle("theme-dark", effective === "dark");

    const button = document.getElementById("theme-btn") || document.getElementById("theme-btn-floating");
    if (button) {
      button.textContent = effective === "light" ? "🌙" : "☀️";
      button.setAttribute("aria-label", effective === "light" ? "Включить тёмную тему" : "Включить светлую тему");
    }
  }

  function toggle() {
    const isLight = document.body.classList.contains("theme-light");
    const nextMode = isLight ? "dark" : "light";
    localStorage.setItem("surp_theme", nextMode);
    apply(nextMode);
  }

  function init() {
    apply(getStoredMode());

    const button = document.getElementById("theme-btn") || document.getElementById("theme-btn-floating");
    if (button && !button.dataset.themeBound) {
      button.dataset.themeBound = "1";
      button.addEventListener("click", toggle);
    }

    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    mq?.addEventListener?.("change", () => {
      if (getStoredMode() === "auto") apply("auto");
    });
  }

  window.SurpTheme = { apply, init, toggle };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
