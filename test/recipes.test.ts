import { test } from "node:test";
import assert from "node:assert/strict";
import * as r from "../src/core/recipes.js";

const PASTED = `Weeknight Chickpea Curry

A quick pantry curry.
Serves 4
Prep time: 10 minutes
Cook time: 25 mins

Ingredients
2 tbsp vegetable oil
1 large onion, finely chopped
3 cloves garlic, minced
1 tbsp curry powder
2 (400 g) cans chickpeas, drained
1 can coconut milk
Salt, to taste

Method
1. Heat the oil and soften the onion for 8 minutes.
2. Add the garlic and curry powder; cook 1 minute.
3. Add the chickpeas and coconut milk and simmer 15 minutes.

Notes
Lovely with rice.`;

test("a pasted recipe is read into its parts", () => {
  const p = r.parseRecipeText(PASTED);
  assert.equal(p.title, "Weeknight Chickpea Curry");
  assert.equal(p.servings, 4);
  assert.equal(p.prepMinutes, 10);
  assert.equal(p.cookMinutes, 25);
  assert.equal(p.ingredients.length, 7);                 // the description line isn't one
  assert.equal(p.ingredients[0], "2 tbsp vegetable oil");
  assert.equal(p.ingredients[1], "1 large onion, finely chopped");
  assert.equal(r.parseRecipeText("Snack\nan apple\nA lovely crisp snack for the afternoon.").ingredients.length, 1);
  assert.deepEqual(p.steps, ["Heat the oil and soften the onion for 8 minutes.", "Add the garlic and curry powder; cook 1 minute.",
                             "Add the chickpeas and coconut milk and simmer 15 minutes."]);
  assert.equal(p.notes, "A quick pantry curry.\nLovely with rice.");
});

test("without headings, amounts mark the ingredients", () => {
  const p = r.parseRecipeText("Lemon Water\n- 1 lemon\n- 500 ml water\nSqueeze the lemon into the water and stir well, then chill it.");
  assert.deepEqual(p.ingredients, ["1 lemon", "500 ml water"]);
  assert.deepEqual(p.steps, ["Squeeze the lemon into the water and stir well, then chill it."]);
  assert.throws(() => r.parseRecipeText("   \n  "), /nothing to read/);
});

test("schema.org recipe data in a page's source is read exactly", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, {
      "@type": "Recipe", name: "Simple Flatbreads", recipeYield: ["6", "6 flatbreads"], prepTime: "PT15M", cookTime: "PT1H5M",
      recipeIngredient: ["250 g plain flour", "150 ml warm water", "1 tsp salt"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Mix everything &amp; knead." },
                           { "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Cook in a dry pan." }] }],
      recipeCuisine: "Middle Eastern", url: "https://example.com/flatbreads",
    }] })}</script></head><body>...</body></html>`;
  const p = r.parseRecipeText(html);
  assert.equal(p.title, "Simple Flatbreads");
  assert.equal(p.servings, 6);
  assert.equal(p.prepMinutes, 15);
  assert.equal(p.cookMinutes, 65);
  assert.deepEqual(p.ingredients, ["250 g plain flour", "150 ml warm water", "1 tsp salt"]);
  assert.deepEqual(p.steps, ["Mix everything & knead.", "Cook in a dry pan."]);
  assert.deepEqual(p.tags, ["middle eastern"]);
  assert.equal(p.source, "https://example.com/flatbreads");
});

test("durations", () => {
  assert.equal(r.parseDuration("1 hour 20 minutes"), 80);
  assert.equal(r.parseDuration("1h20m"), 80);
  assert.equal(r.parseDuration("1 1/2 hours"), 90);
  assert.equal(r.parseDuration("90 min"), 90);
  assert.equal(r.parseDuration("PT2H"), 120);
  assert.equal(r.parseDuration("overnight"), undefined);
  assert.equal(r.formatMinutes(80), "1 h 20 min");
  assert.equal(r.formatMinutes(45), "45 min");
});

test("making and editing recipes checks what matters", () => {
  const recipe = r.makeRecipe({ title: "  Toast ", servings: 1, ingredients: ["2 slices bread", " ", "butter"], tags: ["Breakfast", "#quick", "quick"] });
  assert.equal(recipe.title, "Toast");
  assert.deepEqual(recipe.ingredients, ["2 slices bread", "butter"]);
  assert.deepEqual(recipe.tags, ["breakfast", "quick"]);
  assert.throws(() => r.makeRecipe({ title: "" }), /give the recipe a name/);
  assert.throws(() => r.makeRecipe({ title: "x", servings: 0 }), /servings/);
  assert.throws(() => r.applyEdit(recipe, { rating: 6 }), /1 to 5/);
  const edited = r.applyEdit(recipe, { favorite: true, rating: 5 }, "2030-01-01T00:00:00.000Z");
  assert.equal(edited.favorite, true);
  assert.equal(edited.updated, "2030-01-01T00:00:00.000Z");
  assert.notEqual(r.makeRecipe({ title: "a" }).id, r.makeRecipe({ title: "a" }).id);
});

test("scaling shows sensible amounts, and units can be switched", () => {
  const recipe = r.makeRecipe({ title: "Pancakes", servings: 4,
    ingredients: ["For the batter:", "1 ½ cups flour", "1 tbsp sugar", "2 eggs", "300 ml milk", "a pinch of salt", "berries, to serve (optional)"] });
  const doubled = r.shownIngredients(recipe, 8);
  assert.deepEqual(doubled.map((i) => i.heading ?? `${i.amount ?? ""} ${i.name}`.trim()),
    ["batter", "3 cups flour", "2 tbsp sugar", "4 eggs", "600 ml milk", "2 pinches salt", "berries"]);
  assert.equal(doubled.at(-1)!.optional, true);
  const halved = r.shownIngredients(recipe, 2);
  assert.deepEqual(halved.slice(1, 4).map((i) => i.amount), ["¾ cup", "1 ½ tsp", "1"]);
  const metric = r.shownIngredients(recipe, 4, "metric");
  assert.equal(metric[1]!.amount, "355 ml");
  assert.equal(r.shownIngredients(recipe, 4, "us")[4]!.amount, "1 ¼ cups");
});

test("search ranks title matches first and filters by tag", () => {
  const recipes = [
    r.makeRecipe({ title: "Tomato soup", ingredients: ["4 tomatoes"], tags: ["soup"] }),
    r.makeRecipe({ title: "Pasta", ingredients: ["2 tomatoes", "pasta"], tags: ["dinner"] }),
    r.makeRecipe({ title: "Lentil soup", ingredients: ["lentils"], tags: ["soup"] }),
  ];
  assert.deepEqual(r.search(recipes, "tomato").map((x) => x.title), ["Tomato soup", "Pasta"]);
  assert.deepEqual(r.search(recipes, "", "soup").map((x) => x.title), ["Lentil soup", "Tomato soup"]);
  assert.deepEqual(r.allTags(recipes), [{ tag: "soup", count: 2 }, { tag: "dinner", count: 1 }]);
});
