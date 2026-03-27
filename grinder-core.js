(function () {
  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatRatio(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return "—";
    return `1:${ratio.toFixed(2)}`;
  }

  function buildStatusMeta(status, message, actionLabel) {
    return { status, message, actionLabel };
  }

  function evaluateShot({ dose, yieldWeight, time, recipe, taste }) {
    const ratio = dose > 0 ? yieldWeight / dose : NaN;
    const normalizedTaste = String(taste || "").trim();

    if (time < recipe.time_min) {
      return {
        ...buildStatusMeta("fast", "Пролив слишком быстрый. Сделайте помол мельче.", "Сделайте помол мельче и повторите шот"),
        action: "grind_finer",
        ratio,
        nextStep: recipe.quick_hint_fast || "Сделайте помол мельче и повторите шот."
      };
    }

    if (time > recipe.time_max) {
      return {
        ...buildStatusMeta("slow", "Пролив слишком медленный. Сделайте помол крупнее.", "Сделайте помол крупнее и повторите шот"),
        action: "grind_coarser",
        ratio,
        nextStep: recipe.quick_hint_slow || "Сделайте помол крупнее и повторите шот."
      };
    }

    if (normalizedTaste === "sour") {
      return {
        ...buildStatusMeta("ok", "Время в норме, но вкус кисловатый. Сделайте помол чуть мельче.", "Сделайте помол чуть мельче"),
        action: "grind_finer_slightly",
        ratio,
        nextStep: "Повторите шот и снова оцените вкус."
      };
    }

    if (normalizedTaste === "bitter") {
      return {
        ...buildStatusMeta("ok", "Время в норме, но вкус горчит. Сделайте помол чуть крупнее.", "Сделайте помол чуть крупнее"),
        action: "grind_coarser_slightly",
        ratio,
        nextStep: "Повторите шот и снова оцените вкус."
      };
    }

    if (normalizedTaste === "normal") {
      return {
        ...buildStatusMeta("good", "Настройка удачная. Можно работать с этим рецептом.", "Настройка удачная"),
        action: "done",
        ratio,
        nextStep: "Сохраните эти параметры и продолжайте работу."
      };
    }

    return {
      ...buildStatusMeta("ok", "Параметры близки к рецепту. Оцените вкус напитка.", "Попробуйте напиток на вкус"),
      action: "taste_check",
      ratio,
      nextStep: recipe.quick_hint_ok || "Попробуйте напиток и укажите вкус."
    };
  }

  function validateShotInput({ dose, yieldWeight, time, recipeId }) {
    if (!recipeId || dose === "" || yieldWeight === "" || time === "") {
      return { ok: false, message: "Введите все параметры." };
    }

    const doseNum = safeNumber(dose);
    const yieldNum = safeNumber(yieldWeight);
    const timeNum = safeNumber(time);

    if (
      !Number.isFinite(doseNum) ||
      !Number.isFinite(yieldNum) ||
      !Number.isFinite(timeNum) ||
      doseNum <= 0 ||
      yieldNum <= 0 ||
      timeNum <= 0
    ) {
      return { ok: false, message: "Проверьте корректность чисел." };
    }

    return {
      ok: true,
      values: {
        dose: doseNum,
        yieldWeight: yieldNum,
        time: timeNum
      }
    };
  }

  window.GrinderCore = {
    evaluateShot,
    formatRatio,
    validateShotInput
  };
})();
