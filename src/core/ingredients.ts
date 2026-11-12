/**
 * One line of an ingredient list, understood.
 *
 *   "2 cups all-purpose flour, sifted"   -> 2 cup | all-purpose flour | sifted
 *   "1 (14 oz) can chopped tomatoes"     -> 1 can | chopped tomatoes | 14 oz
 *   "2-3 cloves garlic, minced"          -> 2–3 clove | garlic | minced
 *   "1 large onion, diced"               -> 1 | onion | large, diced
 *   "a pinch of salt"                    -> 1 pinch | salt
 *   "200g butter"                        -> 200 g | butter
 *   "Salt and pepper, to taste"          -> (no amount) | salt and pepper | to taste
 *   "For the sauce:"                     -> a section heading
 *
 * The *key* is what the shopping list adds up by: lower case, without words like
 * "fresh" or "chopped", and singular ("tomatoes" and "tomato" are one line).
 */

import { type Amount, findUnit, readNumber } from "./units.js";

export interface Ingredient {
  raw: string;
  amount?: Amount;
  name: string;
  note?: string;
  optional?: boolean;
}

export interface Heading {
  heading: string;
}

export type IngredientLine = Ingredient | Heading;

export function isHeading(line: IngredientLine): line is Heading {
  return "heading" in line;
}

/** Units people put after the name. Not "leaf", which is part of names such as "bay leaves". */
const TRAILING_UNITS = new Set(["clove", "sprig", "stalk", "slice", "can", "tin", "packet", "bunch", "head", "fillet", "rasher"]);

const SIZES = new Set(["small", "medium", "large", "extra-large", "big", "heaped", "heaping", "level", "rounded", "generous", "scant"]);

function readAmount(text: string): { amount?: Amount; rest: string } {
  let t = text.trim();
  const first = readNumber(t);
  if (!first) return { rest: t };
  t = t.slice(first.length).trim();
  const amount: Amount = { value: first.value };
  // A range: "2-3", "2 – 3", "2 to 3", "2 or 3".
  const range = /^(?:-|–|—|to|or)\s*/i.exec(t);
  if (range) {
    const second = readNumber(t.slice(range[0].length));
    if (second && second.value > first.value) {
      amount.max = second.value;
      t = t.slice(range[0].length + second.length).trim();
    }
  }
  // A size or alternative measure in brackets before the unit: "1 (14 oz) can".
  let aside: string | undefined;
  const paren = /^\(([^)]*)\)\s*/.exec(t);
  if (paren) {
    aside = paren[1]!.trim();
    t = t.slice(paren[0].length);
  }
  // The unit: one or two words ("fl oz"), possibly stuck to the number ("200g").
  const words = /^([A-Za-z.]+)(?:\s+([A-Za-z.]+))?/.exec(t);
  if (words) {
    const two = words[2] ? findUnit(`${words[1]} ${words[2]}`) : undefined;
    const one = findUnit(words[1]!);
    if (two) {
      amount.unit = two;
      t = t.slice(words[0].length).trim();
    } else if (one && !(words[1] === "a" || words[1] === "A")) {
      amount.unit = one;
      t = t.slice(words[1]!.length).trim();
    }
  }
  t = t.replace(/^of\s+/i, "");
  return { amount, rest: aside ? `${t} ||${aside}` : t };
}

export function parseIngredient(rawLine: string): IngredientLine {
  const raw = rawLine.trim().replace(/^[-*•·▪◦]\s*/, "").replace(/\s+/g, " ");
  // A heading: "For the sauce:", "Topping:", "SAUCE".
  if (/^(for the\s+)?[A-Za-z][A-Za-z ,&'-]{0,40}:$/.test(raw) || /^[A-Z][A-Z &'-]{2,30}$/.test(raw)) {
    return { heading: raw.replace(/:$/, "").replace(/^for the\s+/i, "").trim() };
  }
  let { amount, rest } = readAmount(raw);
  const notes: string[] = [];
  const asideAt = rest.indexOf(" ||");
  if (asideAt >= 0) {
    notes.push(rest.slice(asideAt + 3));
    rest = rest.slice(0, asideAt);
  }
  let optional = false;
  rest = rest.replace(/\(optional\)|,?\s*optional$/i, () => {
    optional = true;
    return "";
  }).replace(/^optional:?\s*/i, () => {
    optional = true;
    return "";
  });
  // Bracketed asides after the name: "milk (whole or semi-skimmed)", "1 cup (240 ml) milk".
  rest = rest.replace(/\s*\(([^)]*)\)\s*/g, (_, inside: string) => {
    if (inside.trim()) notes.push(inside.trim());
    return " ";
  }).trim();
  // Preparation after a comma: "garlic, minced". "to taste" anywhere.
  const comma = rest.indexOf(",");
  if (comma > 0) {
    notes.push(rest.slice(comma + 1).trim());
    rest = rest.slice(0, comma).trim();
  }
  rest = rest.replace(/\s+to taste$/i, () => {
    notes.push("to taste");
    return "";
  });
  // Sizes: "1 large onion" -> onion, note "large".
  const words = rest.split(" ");
  const sizes: string[] = [];
  while (words.length > 1 && SIZES.has(words[0]!.toLowerCase())) sizes.push(words.shift()!.toLowerCase());
  if (sizes.length) notes.unshift(sizes.join(" "));
  // The unit after the name: "2 garlic cloves", "3 thyme sprigs", "2 celery stalks".
  if (amount && !amount.unit && words.length > 1) {
    const trailing = findUnit(words.at(-1)!);
    if (trailing && TRAILING_UNITS.has(trailing.id)) {
      amount.unit = trailing;
      words.pop();
    }
  }
  const name = words.join(" ").trim() || raw;
  const out: Ingredient = { raw, name };
  if (amount) out.amount = amount;
  const note = notes.filter(Boolean).join(", ");
  if (note) out.note = note;
  if (optional) out.optional = true;
  return out;
}

export function parseIngredients(text: string): IngredientLine[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(parseIngredient);
}

// -- shopping keys and aisles -----------------------------------------------------------------------------

const PREP = new Set(["fresh", "freshly", "chopped", "diced", "minced", "sliced", "grated", "shredded", "crushed", "ground",
  "finely", "roughly", "thinly", "peeled", "cooked", "uncooked", "raw", "dried", "frozen", "softened", "melted", "cold",
  "warm", "hot", "room-temperature", "boneless", "skinless", "ripe", "organic", "plain", "whole", "unsalted", "salted"]);
const KEEP_PREP = new Set(["ground beef", "ground pork", "ground lamb", "ground turkey", "ground chicken", "whole milk",
  "dried apricots", "dried cranberries", "frozen peas", "plain flour", "cooked rice", "unsalted butter", "salted butter"]);

function singular(word: string): string {
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("leaves")) return word.slice(0, -6) + "leaf";
  if (/(ch|sh|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

/** What to add up by on a shopping list: "Fresh Tomatoes" and "tomato" are the same thing. */
export function key(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (KEEP_PREP.has(lower)) return lower;
  const words = lower.split(" ").filter((w) => !PREP.has(w));
  const kept = words.length ? words : lower.split(" ");
  return kept.map((w, i) => (i === kept.length - 1 ? singular(w) : w)).join(" ");
}

/** The name for a shopping list: without preparation words ("grated ginger" is bought as ginger). */
export function shoppingName(name: string): string {
  const words = name.trim().split(/\s+/);
  const kept = KEEP_PREP.has(words.join(" ").toLowerCase()) ? words : words.filter((w) => !PREP.has(w.toLowerCase()));
  const out = (kept.length ? kept : words).join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const AISLES = ["Produce", "Meat & fish", "Dairy & eggs", "Bakery", "Pantry", "Spices & herbs", "Frozen", "Drinks", "Other"] as const;
export type Aisle = (typeof AISLES)[number];

const AISLE_WORDS: [Aisle, string[]][] = [
  ["Frozen", ["frozen", "ice cream"]],
  ["Spices & herbs", ["salt", "pepper", "cumin", "paprika", "turmeric", "cinnamon", "nutmeg", "oregano", "thyme", "rosemary",
    "chili powder", "chilli powder", "garam masala", "curry powder", "coriander seed", "cardamom", "clove", "bay leaf",
    "vanilla", "saffron", "mustard seed", "fennel seed", "allspice", "cayenne", "italian seasoning", "herbes", "sumac", "za'atar"]],
  ["Meat & fish", ["chicken", "beef", "pork", "lamb", "mutton", "turkey", "bacon", "sausage", "ham", "mince", "steak", "fish",
    "salmon", "tuna", "cod", "prawn", "shrimp", "anchov", "crab", "mussel"]],
  ["Dairy & eggs", ["milk", "butter", "cheese", "cream", "yogurt", "yoghurt", "egg", "ghee", "paneer", "parmesan", "mozzarella",
    "cheddar", "feta", "ricotta", "creme fraiche", "buttermilk"]],
  ["Bakery", ["bread", "bun", "roll", "tortilla", "pita", "naan", "baguette", "croissant", "bagel", "wrap"]],
  ["Drinks", ["wine", "beer", "juice", "coffee", "tea"]],
  ["Produce", ["onion", "garlic", "tomato", "potato", "carrot", "celery", "pepper", "lettuce", "spinach", "kale", "cabbage",
    "broccoli", "cauliflower", "cucumber", "zucchini", "courgette", "aubergine", "eggplant", "mushroom", "lemon", "lime",
    "orange", "apple", "banana", "berry", "berries", "avocado", "ginger", "chilli", "chili", "cilantro", "coriander", "parsley",
    "basil", "mint", "dill", "scallion", "spring onion", "shallot", "leek", "pea", "bean sprout", "corn", "squash", "pumpkin",
    "grape", "mango", "pear", "peach", "sweet potato", "beetroot", "radish", "asparagus", "herb"]],
  ["Pantry", ["flour", "sugar", "rice", "pasta", "spaghetti", "noodle", "oil", "vinegar", "sauce", "stock", "broth", "honey",
    "syrup", "baking", "yeast", "oat", "lentil", "chickpea", "bean", "tomato paste", "canned", "tin", "nut", "almond", "peanut",
    "cocoa", "chocolate", "jam", "mustard", "ketchup", "mayonnaise", "soy", "coconut milk", "cornstarch", "cornflour", "breadcrumb",
    "seed", "raisin", "cereal", "quinoa", "couscous", "lentils"]],
];

/** Things you don't buy. */
const NOT_BOUGHT = new Set(["water", "cold water", "warm water", "hot water", "boiling water", "ice", "ice cube", "tap water"]);

export function aisle(name: string): Aisle {
  const lower = name.toLowerCase();
  // Longer phrases first, so "black pepper" is a spice and "bell pepper" produce.
  if (/\b(bell|red|green|yellow|sweet) peppers?\b/.test(lower)) return "Produce";
  if (/\bcoconut milk\b|\btomato (paste|puree|purée|sauce)\b|\bcanned\b|\btinned\b/.test(lower)) return "Pantry";
  if (/\bpeanut butter\b/.test(lower)) return "Pantry";
  // Words that decide the aisle whatever else the name says: "chicken stock", "fish sauce",
  // "egg noodles", "butter beans" and "cream of tartar" are all on the pantry shelves.
  if (/\b(lemon|lime) (juice|zest)\b/.test(lower)) return "Produce";          // squeezed from the fruit
  if (/\b(baking powder|cocoa powder|custard powder)\b/.test(lower)) return "Pantry";
  if (/\bpowder\b|\bflakes\b|\bseasoning\b/.test(lower)) return "Spices & herbs";
  if (/\b(stock|broth|bouillon|sauce|noodles?|pasta|beans|cream of tartar|crackers?|paste|extract|essence)\b/.test(lower)) return "Pantry";
  for (const [where, words] of AISLE_WORDS) {
    if (words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(lower))) return where;
  }
  return "Other";
}

export function isBought(name: string): boolean {
  return !NOT_BOUGHT.has(key(name));
}
