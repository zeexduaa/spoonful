/**
 * The week's meals, and the shopping list they add up to.
 *
 * A plan maps dates to meals; each meal is a recipe for a number of servings in a
 * slot (breakfast, lunch, dinner or snack). The shopping list for a range of days
 * scales every planned recipe to its servings, reads its ingredients, and adds the
 * same thing up across recipes: 2 cups of milk in one and 250 ml in another is one
 * line of about 3 cups. Amounts that can't be added (2 cloves of garlic and a
 * tablespoon of garlic) stay as separate amounts on the same line. Staples you
 * always have (salt, pepper, oil...) are left off, and water never appears.
 */

import { type Aisle, AISLES, type Ingredient, aisle, isBought, isHeading, key, parseIngredient } from "./ingredients.js";
import type { Recipe } from "./recipes.js";
import { type Amount, add, format, scale, tidy } from "./units.js";

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof SLOTS)[number];

export interface Meal {
  id: string;
  recipe: string;           // recipe id
  servings: number;
  slot: Slot;
}

export type Plan = Record<string, Meal[]>;   // "2026-11-16" -> meals

// -- dates ------------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const toDays = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY;
const fromDays = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  return fromDays(toDays(date) + n);
}

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The first day of the week containing ``date`` (Monday, or Sunday if ``weekStart`` says so). */
export function weekOf(date: string, weekStart: "mon" | "sun" = "mon"): string[] {
  const dow = new Date(toDays(date) * DAY).getUTCDay();          // 0 = Sunday
  const back = weekStart === "mon" ? (dow + 6) % 7 : dow;
  const first = addDays(date, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

// -- changing the plan ---------------------------------------------------------------------------------------------

export function addMeal(plan: Plan, date: string, meal: Omit<Meal, "id">, id: string): Meal {
  if (!(meal.servings > 0 && meal.servings <= 500)) throw new Error("servings must be from 1 to 500");
  const entry: Meal = { id, ...meal };
  plan[date] = [...(plan[date] ?? []), entry].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return entry;
}

export function removeMeal(plan: Plan, date: string, mealId: string): void {
  const left = (plan[date] ?? []).filter((m) => m.id !== mealId);
  if (left.length) plan[date] = left; else delete plan[date];
}

export function moveMeal(plan: Plan, from: string, mealId: string, to: string, slot?: Slot): void {
  const meal = (plan[from] ?? []).find((m) => m.id === mealId);
  if (!meal) return;
  removeMeal(plan, from, mealId);
  addMeal(plan, to, { recipe: meal.recipe, servings: meal.servings, slot: slot ?? meal.slot }, meal.id);
}

/** Copies one week's meals to the following week (new ids from ``makeId``). Returns how many were copied. */
export function copyWeek(plan: Plan, days: string[], makeId: () => string): number {
  let n = 0;
  for (const day of days) {
    for (const meal of plan[day] ?? []) {
      addMeal(plan, addDays(day, 7), { recipe: meal.recipe, servings: meal.servings, slot: meal.slot }, makeId());
      n++;
    }
  }
  return n;
}

/** Drops meals whose recipe no longer exists (after a recipe is deleted). */
export function prune(plan: Plan, recipeIds: Set<string>): void {
  for (const [date, meals] of Object.entries(plan)) {
    const left = meals.filter((m) => recipeIds.has(m.recipe));
    if (left.length) plan[date] = left; else delete plan[date];
  }
}

// -- the shopping list ---------------------------------------------------------------------------------------------

export interface ShoppingLine {
  key: string;
  name: string;             // as first written
  amounts: string[];        // "3 cups"; several when they can't be added up; empty for "to taste"
  aisle: Aisle;
  recipes: string[];        // titles it's for
}

export interface ShoppingGroup {
  aisle: Aisle;
  lines: ShoppingLine[];
}

export const DEFAULT_STAPLES = ["salt", "black pepper", "pepper", "olive oil", "vegetable oil", "oil", "sugar", "flour", "water"];

interface Gathering {
  name: string;
  amounts: Amount[];
  recipes: Set<string>;
}

export function shoppingList(plan: Plan, recipes: Recipe[], days: string[], staples: string[] = DEFAULT_STAPLES): ShoppingGroup[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const skip = new Set(staples.map(key));
  const gathered = new Map<string, Gathering>();
  for (const day of days) {
    for (const meal of plan[day] ?? []) {
      const recipe = byId.get(meal.recipe);
      if (!recipe) continue;
      const factor = meal.servings / recipe.servings;
      for (const raw of recipe.ingredients) {
        const line = parseIngredient(raw);
        if (isHeading(line) || (line as Ingredient).optional) continue;
        const ingredient = line as Ingredient;
        const k = key(ingredient.name);
        if (!k || skip.has(k) || !isBought(ingredient.name)) continue;
        const entry = gathered.get(k) ?? { name: ingredient.name, amounts: [], recipes: new Set<string>() };
        entry.recipes.add(recipe.title);
        if (ingredient.amount) {
          const amount = scale(ingredient.amount, factor);
          const index = entry.amounts.findIndex((a) => add(a, amount));
          if (index >= 0) entry.amounts[index] = add(entry.amounts[index]!, amount)!;
          else entry.amounts.push(amount);
        }
        gathered.set(k, entry);
      }
    }
  }
  const groups = new Map<Aisle, ShoppingLine[]>();
  for (const [k, g] of gathered) {
    const where = aisle(g.name);
    const line: ShoppingLine = { key: k, name: g.name.charAt(0).toUpperCase() + g.name.slice(1), aisle: where,
                                 amounts: g.amounts.map((a) => format(roundUpCount(tidy(a)))), recipes: [...g.recipes].sort() };
    groups.set(where, [...(groups.get(where) ?? []), line]);
  }
  return AISLES.filter((a) => groups.has(a)).map((a) => ({ aisle: a, lines: groups.get(a)!.sort((x, y) => x.name.localeCompare(y.name)) }));
}

/** You can't buy 2.3 onions or half a lemon: whole things are rounded up to buy (2.3 is 3, half is 1). */
function roundUpCount(amount: Amount): Amount {
  if (amount.unit && amount.unit.dimension !== "count") return amount;
  const up = (n: number) => Math.max(1, Math.ceil(n - 0.05));     // 2.02 stays 2: rounding noise from scaling
  const out: Amount = { value: amount.unit?.id === "pinch" || amount.unit?.id === "dash" ? amount.value : up(amount.value) };
  if (amount.max !== undefined) out.max = up(amount.max);
  if (amount.unit) out.unit = amount.unit;
  return out;
}

export function countMeals(plan: Plan, days: string[]): number {
  return days.reduce((n, d) => n + (plan[d]?.length ?? 0), 0);
}
