(function () {
  const LAST_RECIPE_KEY = "surpresso_grinder_last_recipe";
  const HISTORY_KEY = "surpresso_grinder_history_v1";
  const MAX_HISTORY = 5;

  const state = {
    recipeId: "",
    history: [],
    context: {
      equipmentId: "",
      clientId: ""
    }
  };

  function getElements() {
    return {
      form: document.getElementById("grinder-form"),
      recipeSelect: document.getElementById("recipe-select"),
      recipeSummary: document.getElementById("recipe-summary"),
      doseInput: document.getElementById("dose-input"),
      yieldInput: document.getElementById("yield-input"),
      timeInput: document.getElementById("time-input"),
      tasteSelect: document.getElementById("taste-select"),
      errorBox: document.getElementById("form-error"),
      resultBox: document.getElementById("result-zone"),
      supportBox: document.getElementById("support-zone"),
      historyBox: document.getElementById("history-zone"),
      clearHistoryBtn: document.getElementById("clear-history-btn")
    };
  }

  function parseQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
      recipeId: params.get("recipe") || "",
      equipmentId: params.get("equipmentId") || "",
      clientId: params.get("clientId") || ""
    };
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, MAX_HISTORY)));
  }

  function setFormError(message) {
    const { errorBox } = getElements();
    if (!errorBox) return;
    errorBox.textContent = message || "";
    errorBox.classList.toggle("is-visible", Boolean(message));
  }

  function getRecipe() {
    return window.GrinderRecipes.getRecipeById(state.recipeId);
  }

  function updateRecipeSummary(recipe) {
    const { recipeSummary, doseInput, yieldInput } = getElements();
    if (!recipeSummary) return;

    if (!recipe) {
      recipeSummary.textContent = "Выберите рецепт, чтобы увидеть подсказку по диапазону.";
      return;
    }

    recipeSummary.textContent = `${recipe.name}: ${recipe.description}`;

    if (doseInput && !doseInput.value) doseInput.value = recipe.dose;
    if (yieldInput && !yieldInput.value) yieldInput.value = recipe.yield;
  }

  function renderResult(result, recipe) {
    const { resultBox } = getElements();
    if (!resultBox) return;

    const statusLabels = {
      fast: "Быстрый пролив",
      slow: "Медленный пролив",
      ok: "Почти готово",
      good: "Отлично"
    };

    resultBox.innerHTML = `
      <article class="grinder-result-card status-${result.status}">
        <p class="grinder-result-status">${statusLabels[result.status] || result.status}</p>
        <h2>${result.message}</h2>
        <p class="grinder-result-action">${result.actionLabel}</p>
        <div class="grinder-result-meta">
          <span><strong>Рецепт:</strong> ${recipe.name}</span>
          <span><strong>Соотношение:</strong> ${window.GrinderCore.formatRatio(result.ratio)}</span>
        </div>
        <p class="grinder-result-next">${result.nextStep}</p>
      </article>
    `;
  }

  function renderSupportHint() {
    const { supportBox } = getElements();
    if (!supportBox) return;

    const streak = state.history
      .slice(0, 3)
      .every(item => item.status !== "good" && item.status !== "ok");

    if (state.history.length >= 3 && streak) {
      supportBox.innerHTML = `
        <article class="grinder-help-card">
          <h3>Не получается выйти в рабочий диапазон</h3>
          <ul>
            <li>Проверьте дозировку.</li>
            <li>Проверьте весы.</li>
            <li>Убедитесь, что кофе свежий.</li>
            <li>Проверьте чистоту гриндера.</li>
            <li>При необходимости обратитесь к тренеру.</li>
          </ul>
        </article>
      `;
      return;
    }

    supportBox.innerHTML = "";
  }

  function renderHistory() {
    const { historyBox } = getElements();
    if (!historyBox) return;

    if (!state.history.length) {
      historyBox.innerHTML = '<div class="grinder-empty">Пока нет попыток. Введите параметры и получите первый совет.</div>';
      return;
    }

    const cards = state.history
      .slice(0, MAX_HISTORY)
      .map((item, index) => {
        return `
          <article class="grinder-history-card">
            <p class="grinder-history-title">Попытка ${index + 1}</p>
            <p>${item.recipeName}</p>
            <p>${item.dose} г → ${item.yieldWeight} г за ${item.time} сек</p>
            <p><strong>Ratio:</strong> ${window.GrinderCore.formatRatio(item.ratio)}</p>
            <p><strong>Статус:</strong> ${item.status}</p>
            <p><strong>Совет:</strong> ${item.actionLabel}</p>
          </article>
        `;
      })
      .join("");

    historyBox.innerHTML = cards;
  }

  function addAttempt(attempt) {
    state.history.unshift(attempt);
    state.history = state.history.slice(0, MAX_HISTORY);
    saveHistory();
    renderHistory();
    renderSupportHint();
  }

  function fillRecipesSelect(defaultRecipeId) {
    const { recipeSelect } = getElements();
    if (!recipeSelect) return;

    recipeSelect.innerHTML = '<option value="">Выберите рецепт</option>';
    window.GrinderRecipes.RECIPES.forEach(recipe => {
      const option = document.createElement("option");
      option.value = recipe.id;
      option.textContent = recipe.name;
      recipeSelect.appendChild(option);
    });

    if (defaultRecipeId && window.GrinderRecipes.getRecipeById(defaultRecipeId)) {
      recipeSelect.value = defaultRecipeId;
      state.recipeId = defaultRecipeId;
    } else {
      state.recipeId = recipeSelect.value;
    }

    updateRecipeSummary(getRecipe());
  }

  function onRecipeChange() {
    const { recipeSelect } = getElements();
    if (!recipeSelect) return;

    state.recipeId = recipeSelect.value;
    localStorage.setItem(LAST_RECIPE_KEY, state.recipeId);
    updateRecipeSummary(getRecipe());
    setFormError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    const { doseInput, yieldInput, timeInput, tasteSelect } = getElements();
    const recipe = getRecipe();

    const validation = window.GrinderCore.validateShotInput({
      recipeId: state.recipeId,
      dose: doseInput?.value,
      yieldWeight: yieldInput?.value,
      time: timeInput?.value
    });

    if (!recipe || !validation.ok) {
      setFormError(validation.message || "Введите все параметры.");
      return;
    }

    setFormError("");

    const result = window.GrinderCore.evaluateShot({
      ...validation.values,
      recipe,
      taste: tasteSelect?.value || ""
    });

    renderResult(result, recipe);

    addAttempt({
      recipeId: recipe.id,
      recipeName: recipe.name,
      dose: validation.values.dose,
      yieldWeight: validation.values.yieldWeight,
      time: validation.values.time,
      ratio: result.ratio,
      status: result.status,
      action: result.action,
      actionLabel: result.actionLabel,
      createdAt: new Date().toISOString()
    });
  }

  function bindEvents() {
    const { form, recipeSelect, clearHistoryBtn } = getElements();

    form?.addEventListener("submit", handleSubmit);
    recipeSelect?.addEventListener("change", onRecipeChange);
    clearHistoryBtn?.addEventListener("click", () => {
      state.history = [];
      saveHistory();
      renderHistory();
      renderSupportHint();
      const { resultBox, supportBox } = getElements();
      if (resultBox) resultBox.innerHTML = "";
      if (supportBox) supportBox.innerHTML = "";
    });
  }

  function init() {
    const query = parseQuery();
    state.context.equipmentId = query.equipmentId;
    state.context.clientId = query.clientId;

    const savedRecipe = localStorage.getItem(LAST_RECIPE_KEY) || "";
    const preferredRecipe = query.recipeId || savedRecipe || window.GrinderRecipes.RECIPES[0]?.id || "";

    fillRecipesSelect(preferredRecipe);

    state.history = loadHistory();
    renderHistory();
    renderSupportHint();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
