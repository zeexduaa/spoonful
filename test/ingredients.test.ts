import { test } from "node:test";
import assert from "node:assert/strict";
import { type Ingredient, aisle, isBought, isHeading, key, parseIngredient, parseIngredients, shoppingName } from "../src/core/ingredients.js";
import { format } from "../src/core/units.js";

function read(line: string) {
  const i = parseIngredient(line) as Ingredient;
  return [i.amount ? format(i.amount) : "", i.name, i.note ?? "", i.optional ? "optional" : ""];
}

test("reads ingredient lines the way recipes write them", () => {
  assert.deepEqual(read("2 cups all-purpose flour, sifted"), ["2 cups", "all-purpose flour", "sifted", ""]);
  assert.deepEqual(read("1 (14 oz) can chopped tomatoes"), ["1 can", "chopped tomatoes", "14 oz", ""]);
  assert.deepEqual(read("2-3 cloves garlic, minced"), ["2–3 cloves", "garlic", "minced", ""]);
  assert.deepEqual(read("2 to 3 cloves garlic"), ["2–3 cloves", "garlic", "", ""]);
  assert.deepEqual(read("1 large onion, diced"), ["1", "onion", "large, diced", ""]);
  assert.deepEqual(read("a pinch of salt"), ["1 pinch", "salt", "", ""]);
  assert.deepEqual(read("200g butter"), ["200 g", "butter", "", ""]);
  assert.deepEqual(read("1½ tsp baking powder"), ["1 ½ tsp", "baking powder", "", ""]);
  assert.deepEqual(read("1 cup (240 ml) whole milk"), ["1 cup", "whole milk", "240 ml", ""]);
  assert.deepEqual(read("Salt and pepper, to taste"), ["", "Salt and pepper", "to taste", ""]);
  assert.deepEqual(read("3 eggs"), ["3", "eggs", "", ""]);
  assert.deepEqual(read("2 T olive oil"), ["2 tbsp", "olive oil", "", ""]);
  assert.deepEqual(read("1 t vanilla extract"), ["1 tsp", "vanilla extract", "", ""]);
  assert.deepEqual(read("- 1 tbsp chopped parsley (optional)"), ["1 tbsp", "chopped parsley", "", "optional"]);
  assert.deepEqual(read("4 fl oz cream"), ["4 fl oz", "cream", "", ""]);
  assert.deepEqual(read("an avocado"), ["1", "avocado", "", ""]);
  assert.deepEqual(read("2 garlic cloves, crushed"), ["2 cloves", "garlic", "crushed", ""]);
  assert.deepEqual(read("3 thyme sprigs"), ["3 sprigs", "thyme", "", ""]);
  assert.deepEqual(read("2 bay leaves"), ["2", "bay leaves", "", ""]);
});

test("headings separate parts of a recipe", () => {
  const lines = parseIngredients("For the sauce:\n2 tbsp soy sauce\n\nTOPPING\n1 tsp sesame seeds");
  assert.deepEqual(lines.map((l) => (isHeading(l) ? `# ${l.heading}` : (l as Ingredient).name)),
    ["# sauce", "soy sauce", "# TOPPING", "sesame seeds"]);
});

test("shopping keys add up the same thing written differently", () => {
  assert.equal(key("Fresh Tomatoes"), "tomato");
  assert.equal(key("tomato"), "tomato");
  assert.equal(key("chopped onions"), "onion");
  assert.equal(key("Berries"), "berry");
  assert.equal(key("bay leaves"), "bay leaf");
  assert.equal(key("Ground beef"), "ground beef");
  assert.equal(key("ground cumin"), "cumin");
  assert.equal(key("unsalted butter"), "unsalted butter");
  assert.equal(key("asparagus"), "asparagus");
});

test("aisles follow the shop", () => {
  assert.equal(aisle("red onion"), "Produce");
  assert.equal(aisle("black pepper"), "Spices & herbs");
  assert.equal(aisle("red bell pepper"), "Produce");
  assert.equal(aisle("chicken thighs"), "Meat & fish");
  assert.equal(aisle("cheddar cheese"), "Dairy & eggs");
  assert.equal(aisle("coconut milk"), "Pantry");
  assert.equal(aisle("frozen peas"), "Frozen");
  assert.equal(aisle("basmati rice"), "Pantry");
  assert.equal(aisle("naan bread"), "Bakery");
  assert.equal(aisle("unobtainium"), "Other");
  assert.equal(aisle("chicken stock"), "Pantry");
  assert.equal(aisle("fish sauce"), "Pantry");
  assert.equal(aisle("egg noodles"), "Pantry");
  assert.equal(aisle("butter beans"), "Pantry");
  assert.equal(aisle("garlic powder"), "Spices & herbs");
  assert.equal(aisle("chilli flakes"), "Spices & herbs");
  assert.equal(aisle("baking powder"), "Pantry");
  assert.equal(aisle("vanilla extract"), "Pantry");
  assert.equal(aisle("lemon juice"), "Produce");
  assert.equal(aisle("rolled oats"), "Pantry");
  assert.equal(aisle("minced garlic"), "Produce");
  assert.equal(aisle("anchovies"), "Meat & fish");
  assert.equal(aisle("dinner rolls"), "Bakery");
  assert.equal(aisle("mushrooms"), "Produce");
  assert.equal(aisle("tomatoes"), "Produce");
  assert.equal(aisle("blueberries"), "Produce");
  assert.equal(isBought("cold water"), false);
  assert.equal(isBought("milk"), true);
});


test("shopping names leave out how things are prepared", () => {
  assert.equal(shoppingName("grated ginger"), "Ginger");
  assert.equal(shoppingName("finely chopped fresh parsley"), "Parsley");
  assert.equal(shoppingName("Ground beef"), "Ground beef");
  assert.equal(shoppingName("unsalted butter"), "Unsalted butter");
  assert.equal(shoppingName("chopped"), "Chopped");
});
