import { test } from "node:test";
import assert from "node:assert/strict";
import * as p from "../src/core/planner.js";
import * as s from "../src/core/storage.js";
import { makeRecipe } from "../src/core/recipes.js";

let n = 0;
const id = () => `m${++n}`;

function kitchen() {
  const curry = makeRecipe({ title: "Curry", servings: 4, ingredients: ["2 tbsp oil", "1 large onion", "3 cloves garlic", "400 ml coconut milk",
    "1 tsp salt", "Coriander, to serve"] });
  const porridge = makeRecipe({ title: "Porridge", servings: 1, ingredients: ["½ cup oats", "1 cup milk", "½ banana", "water"] });
  const pasta = makeRecipe({ title: "Pasta", servings: 2, ingredients: ["200 g pasta", "2 garlic cloves", "1 tbsp chopped garlic",
    "250 ml milk", "1 onion, sliced", "Parmesan (optional)"] });
  return { curry, porridge, pasta, recipes: [curry, porridge, pasta] };
}

test("weeks start on Monday or Sunday", () => {
  assert.deepEqual(p.weekOf("2026-11-12"), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  assert.equal(p.weekOf("2026-11-12", "sun")[0], "2026-11-08");
  assert.equal(p.weekOf("2026-11-15")[0], "2026-11-09");
  assert.equal(p.addDays("2026-12-31", 1), "2027-01-01");
});

test("planning, moving and copying meals", () => {
  const { curry, porridge } = kitchen();
  const plan: p.Plan = {};
  p.addMeal(plan, "2026-11-09", { recipe: curry.id, servings: 4, slot: "dinner" }, id());
  const breakfast = p.addMeal(plan, "2026-11-09", { recipe: porridge.id, servings: 2, slot: "breakfast" }, id());
  assert.deepEqual(plan["2026-11-09"]!.map((m) => m.slot), ["breakfast", "dinner"]);
  p.moveMeal(plan, "2026-11-09", breakfast.id, "2026-11-10");
  assert.equal(plan["2026-11-10"]![0]!.recipe, porridge.id);
  assert.equal(p.copyWeek(plan, p.weekOf("2026-11-09"), id), 2);
  assert.equal(p.countMeals(plan, p.weekOf("2026-11-16")), 2);
  p.prune(plan, new Set([curry.id]));
  assert.equal(p.countMeals(plan, [...p.weekOf("2026-11-09"), ...p.weekOf("2026-11-16")]), 2);
  assert.throws(() => p.addMeal(plan, "2026-11-11", { recipe: curry.id, servings: 0, slot: "lunch" }, id()), /servings/);
});

test("the shopping list adds up the week, by aisle", () => {
  const { curry, porridge, pasta, recipes } = kitchen();
  const plan: p.Plan = {};
  p.addMeal(plan, "2026-11-09", { recipe: curry.id, servings: 6, slot: "dinner" }, id());       // 1.5x
  p.addMeal(plan, "2026-11-10", { recipe: porridge.id, servings: 2, slot: "breakfast" }, id()); // 2x
  p.addMeal(plan, "2026-11-11", { recipe: pasta.id, servings: 2, slot: "dinner" }, id());
  p.addMeal(plan, "2026-11-20", { recipe: pasta.id, servings: 2, slot: "dinner" }, id());       // next week: not included
  const list = p.shoppingList(plan, recipes, p.weekOf("2026-11-09"));
  const lines = Object.fromEntries(list.flatMap((g) => g.lines.map((l) => [l.key, [g.aisle, l.amounts.join(" + ")]])));
  assert.deepEqual(lines["onion"], ["Produce", "3"]);                    // 1.5 large onions + 1 onion: buy 3
  // 4.5 cloves (curry x1.5) + "2 garlic cloves" (pasta) = 6.5, so buy 7; the tablespoon can't be added to cloves.
  assert.deepEqual(lines["garlic"], ["Produce", "7 cloves + 1 tbsp"]);
  assert.deepEqual(lines["milk"], ["Dairy & eggs", "3 cups"]);           // 2 cups + 250 ml
  assert.deepEqual(lines["coconut milk"], ["Pantry", "600 ml"]);
  assert.deepEqual(lines["banana"], ["Produce", "1"]);
  assert.deepEqual(lines["coriander"], ["Produce", ""]);                 // "to serve": listed without an amount
  assert.equal(lines["oil"], undefined);                                  // a staple
  assert.equal(lines["salt"], undefined);
  assert.equal(lines["water"], undefined);
  assert.equal(lines["parmesan"], undefined);                             // optional
  assert.deepEqual(list.map((g) => g.aisle), ["Produce", "Dairy & eggs", "Pantry"]);
  const garlic = list.flatMap((g) => g.lines).find((l) => l.key === "garlic")!;
  assert.deepEqual(garlic.recipes, ["Curry", "Pasta"]);
});

test("storage round-trips, repairs and refuses", () => {
  const map = new Map<string, string>();
  const kv = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  assert.deepEqual(s.load(kv), s.emptyState());
  const state = s.emptyState();
  state.recipes.push(makeRecipe({ title: "Soup" }));
  s.save(kv, state);
  assert.equal(s.load(kv).recipes[0]!.title, "Soup");
  map.set(s.STORAGE_KEY, "{oops");
  assert.throws(() => s.load(kv), /damaged; restore a backup/);
  assert.throws(() => s.parseState({ format: "spoonful", version: 9 }), /newer version/);
  assert.throws(() => s.parseState({ hello: 1 }), /isn't a spoonful backup/);
  const repaired = s.parseState({ format: "spoonful", version: 1, recipes: [{ id: "a", title: "Ok", tags: ["X"] }, { title: "no id" }],
                                  plan: { "2026-11-09": [{ id: "m", recipe: "a", servings: 2, slot: "dinner" }, { bad: true }], nonsense: [] },
                                  settings: { units: "imperial" } });
  assert.equal(repaired.recipes.length, 1);
  assert.deepEqual(repaired.recipes[0]!.tags, ["x"]);
  assert.equal(repaired.plan["2026-11-09"]!.length, 1);
  assert.equal(repaired.plan["nonsense"], undefined);
  assert.equal(repaired.settings.units, "as-written");
  const quota = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.throws(() => s.save(quota, state), /storage is full/);
});

test("merging a backup keeps the latest edit of each recipe", () => {
  const mine = s.emptyState();
  const theirs = s.emptyState();
  const a = makeRecipe({ title: "Soup" }, "2026-01-01T00:00:00.000Z");
  mine.recipes.push(a);
  theirs.recipes.push({ ...a, title: "Better soup", updated: "2026-02-01T00:00:00.000Z" }, makeRecipe({ title: "Bread" }));
  const { state, added, updated } = s.merge(mine, theirs);
  assert.deepEqual([added, updated], [1, 1]);
  assert.deepEqual(state.recipes.map((r) => r.title).sort(), ["Better soup", "Bread"]);
  const older = s.merge(state, { ...s.emptyState(), recipes: [{ ...a, title: "Old soup" }] });
  assert.equal(older.updated, 0);
});


test("a damaged backup can't put bad values into recipes", () => {
  const state = s.parseState({ format: "spoonful", version: 1, recipes: [{
    id: "a", title: "  Soup  ", servings: "lots", prepMinutes: "abc", cookMinutes: -5, rating: 99, favorite: "yes", source: 42,
    notes: { x: 1 }, steps: ["Heat", 7], ingredients: "not a list", unknownField: "<script>",
  }, { id: "b", title: "Stew", prepMinutes: "15", cookMinutes: 90, rating: 4, favorite: true, notes: "good" }] });
  const [soup, stew] = state.recipes;
  assert.deepEqual(Object.keys(soup!).sort(), ["created", "id", "ingredients", "servings", "steps", "tags", "title", "updated"]);
  assert.deepEqual([soup!.title, soup!.servings, soup!.steps, soup!.ingredients], ["Soup", 4, ["Heat"], []]);
  assert.deepEqual([stew!.prepMinutes, stew!.cookMinutes, stew!.rating, stew!.favorite, stew!.notes], [15, 90, 4, true, "good"]);
});
