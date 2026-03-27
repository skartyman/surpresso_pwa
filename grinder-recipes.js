(function () {
  const RECIPES = [
    {
      id: "espresso_basic",
      name: "Эспрессо базовый",
      description: "18 г → 36 г за 25–30 сек",
      dose: 18,
      yield: 36,
      time_min: 25,
      time_max: 30,
      quick_hint_fast: "Сделайте помол мельче и повторите шот.",
      quick_hint_slow: "Сделайте помол крупнее и повторите шот.",
      quick_hint_ok: "Параметры близки к рецепту. Оцените вкус."
    },
    {
      id: "espresso_milk",
      name: "Эспрессо для молочных",
      description: "18 г → 40 г за 24–29 сек",
      dose: 18,
      yield: 40,
      time_min: 24,
      time_max: 29,
      quick_hint_fast: "Сделайте помол мельче и повторите шот.",
      quick_hint_slow: "Сделайте помол крупнее и повторите шот.",
      quick_hint_ok: "Параметры близки к рецепту. Оцените вкус."
    },
    {
      id: "espresso_decaf",
      name: "Декаф",
      description: "18 г → 36 г за 26–32 сек",
      dose: 18,
      yield: 36,
      time_min: 26,
      time_max: 32,
      quick_hint_fast: "Сделайте помол мельче и повторите шот.",
      quick_hint_slow: "Сделайте помол крупнее и повторите шот.",
      quick_hint_ok: "Параметры близки к рецепту. Оцените вкус."
    }
  ];

  function getRecipeById(recipeId) {
    return RECIPES.find(recipe => recipe.id === recipeId) || null;
  }

  window.GrinderRecipes = {
    RECIPES,
    getRecipeById
  };
})();
