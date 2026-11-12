/**
 * Recipes: what's kept, how a pasted recipe is read, scaling and searching.
 *
 * Ingredients are kept as the lines the cook wrote ("2 cups flour, sifted") and
 * understood when shown, so nothing is lost if the reading is imperfect, and
 * improving the reader improves every saved recipe.
 *
 * Pasting a recipe copied from a web page, an email or a document usually just
 * works: the first line is the title; "Serves 4", "Prep: 15 min" and similar are
 * picked up; "Ingredients" and "Method"/"Instructions"/"Directions" split the
 * rest; without those headings, lines that start with an amount are taken as
 * ingredients and the rest as steps. Many recipe websites include the recipe as
 * schema.org data in their page source; pasting that source is read exactly.
 */

import { type IngredientLine, isHeading, parseIngredient } from "./ingredients.js";
import { type Amount, type System, convert, format, readNumber, scale, tidy } from "./units.js";

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  tags: string[];
  notes?: string;
  source?: string;
  favorite?: boolean;
  rating?: number;          // 1 to 5
  created: string;          // ISO time
  updated: string;
}

export class RecipeError extends Error {
  override name = "RecipeError";
}

export function newId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type RecipeInput = Partial<Omit<Recipe, "id" | "created" | "updated">> & { title: string };

export function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].sort();
}

export function makeRecipe(input: RecipeInput, now = new Date().toISOString()): Recipe {
  const recipe: Recipe = { id: newId(), title: "", servings: 4, ingredients: [], steps: [], tags: [], created: now, updated: now };
  return applyEdit(recipe, input, now);
}

export function applyEdit(recipe: Recipe, input: Partial<RecipeInput>, now = new Date().toISOString()): Recipe {
  const next: Recipe = { ...recipe, updated: now };
  if (input.title !== undefined) next.title = input.title.trim();
  if (!next.title) throw new RecipeError("give the recipe a name");
  if (next.title.length > 150) throw new RecipeError("the name is too long (150 characters at most)");
  if (input.servings !== undefined) next.servings = input.servings;
  if (!Number.isFinite(next.servings) || next.servings <= 0 || next.servings > 500) {
    throw new RecipeError("servings must be a number from 1 to 500");
  }
  if (input.ingredients !== undefined) next.ingredients = input.ingredients.map((l) => l.trim()).filter(Boolean);
  if (input.steps !== undefined) next.steps = input.steps.map((l) => l.trim()).filter(Boolean);
  for (const key of ["prepMinutes", "cookMinutes"] as const) {
    if (input[key] === undefined) continue;
    const v = input[key]!;
    if (!Number.isFinite(v) || v < 0 || v > 60 * 24 * 7) throw new RecipeError("times are minutes, from 0 to a week");
    if (v) next[key] = Math.round(v); else delete next[key];
  }
  if (input.tags !== undefined) next.tags = cleanTags(input.tags);
  for (const key of ["notes", "source"] as const) {
    if (input[key] === undefined) continue;
    const v = input[key]!.trim();
    if (v) next[key] = v; else delete next[key];
  }
  if (input.favorite !== undefined) {
    if (input.favorite) next.favorite = true; else delete next.favorite;
  }
  if (input.rating !== undefined) {
    if (input.rating === 0) delete next.rating;
    else if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new RecipeError("a rating is 1 to 5 stars");
    else next.rating = input.rating;
  }
  return next;
}

// -- times ---------------------------------------------------------------------------------------------------

/** "1 hour 20 minutes", "1h20", "90 min", "1 1/2 hours", "PT1H20M" (schema.org). Returns minutes. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  const iso = /^p(?:t)?(?:(\d+)d)?t?(?:(\d+)h)?(?:(\d+)m)?/i.exec(t);
  if (iso && (iso[1] || iso[2] || iso[3])) return Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
  let total = 0;
  let found = false;
  // (?![a-z]) rather than \b, so "1h20m" reads as 1 hour 20 minutes.
  const re = /(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|[½¼¾])\s*(hours?|hrs?|h|minutes?|mins?|m)(?![a-z])/g;
  for (const m of t.matchAll(re)) {
    const n = readNumber(m[1]!)?.value ?? 0;
    total += m[2]!.startsWith("h") ? n * 60 : n;
    found = true;
  }
  return found ? Math.round(total) : undefined;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// -- reading a pasted recipe -------------------------------------------------------------------------------

const SECTION = {
  ingredients: /^(ingredients?|you will need|you'll need|what you need)\s*:?$/i,
  steps: /^(method|instructions?|directions?|steps?|preparation|how to make( it)?)\s*:?$/i,
  notes: /^(notes?|tips?|cook'?s notes?|variations?)\s*:?$/i,
};

function stepText(line: string): string {
  return line.replace(/^(step\s*)?\d+\s*[.):-]\s*/i, "").replace(/^[-*•]\s*/, "").trim();
}

function looksLikeIngredient(line: string): boolean {
  const l = line.replace(/^[-*•▪◦]\s*/, "");
  if (/^[\d½⅓⅔¼¾⅛⅜⅝⅞]/.test(l)) return !/^\d+\s*[.)]\s+\D/.test(l);         // "2 eggs", not "2. Beat the eggs"
  // "an onion", "a pinch of salt", but not a sentence such as "A quick pantry curry."
  const sentence = /[.!?]$/.test(l) || l.split(" ").length > 7;
  return (!sentence && /^(a|an|one|two|three|half|pinch|handful)\s/i.test(l)) || (/\bto taste\b/i.test(l) && l.length < 60);
}

export interface Parsed {
  title: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: string[];
  steps: string[];
  notes?: string;
  source?: string;
  tags?: string[];
}

export function parseRecipeText(text: string): Parsed {
  const structured = parseSchemaOrg(text);
  if (structured) return structured;
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const result: Parsed = { title: "", ingredients: [], steps: [] };
  const notes: string[] = [];
  let section: "intro" | "ingredients" | "steps" | "notes" = "intro";
  // With an "Ingredients" heading somewhere, what comes before it is description, not ingredients.
  let sawHeadings = lines.some((l) => SECTION.ingredients.test(l));
  for (const line of lines) {
    if (!line) continue;
    if (!result.title) {
      result.title = line.replace(/^#+\s*/, "").slice(0, 150);
      continue;
    }
    if (SECTION.ingredients.test(line)) { section = "ingredients"; sawHeadings = true; continue; }
    if (SECTION.steps.test(line)) { section = "steps"; sawHeadings = true; continue; }
    if (SECTION.notes.test(line)) { section = "notes"; continue; }
    const serves = /^(?:serves|servings|yield|makes|portions)\s*:?\s*(\d+)/i.exec(line) ?? /(?:^|\b)serves\s+(\d+)/i.exec(line);
    if (serves && section !== "steps" && line.length < 60) {
      result.servings = Number(serves[1]);
      continue;
    }
    const time = /^(prep|preparation|cook|cooking|bake|baking|total)\s*(?:time)?\s*:?\s*(.+)$/i.exec(line);
    if (time && line.length < 60 && parseDuration(time[2]!) !== undefined) {
      const minutes = parseDuration(time[2]!)!;
      if (/^prep/i.test(time[1]!)) result.prepMinutes = minutes;
      else if (/^(cook|bak)/i.test(time[1]!)) result.cookMinutes = minutes;
      else if (result.prepMinutes === undefined && result.cookMinutes === undefined) result.cookMinutes = minutes;
      continue;
    }
    if (/^(source|from|adapted from)\s*:/i.test(line) || /^https?:\/\/\S+$/.test(line)) {
      result.source = line.replace(/^(source|from|adapted from)\s*:\s*/i, "");
      continue;
    }
    if (section === "intro" && sawHeadings) {
      notes.push(line);
    } else if (section === "intro") {
      // No headings yet: decide line by line.
      if (looksLikeIngredient(line)) result.ingredients.push(line.replace(/^[-*•▪◦]\s*/, ""));
      else if (result.ingredients.length || /^(step\s*)?\d+\s*[.)]/i.test(line) || line.length > 60) result.steps.push(stepText(line));
      else notes.push(line);
    } else if (section === "ingredients") {
      result.ingredients.push(line.replace(/^[-*•▪◦]\s*/, ""));
    } else if (section === "steps") {
      const step = stepText(line);
      if (step) result.steps.push(step);
    } else {
      notes.push(line);
    }
  }
  if (!result.title) throw new RecipeError("there's nothing to read: paste a recipe with its name on the first line");
  if (notes.length) result.notes = notes.join("\n");
  return result;
}

/** schema.org Recipe data, as many recipe websites embed in their page (JSON-LD), if the text holds some. */
export function parseSchemaOrg(text: string): Parsed | undefined {
  if (!/"@type"\s*:\s*\[?\s*"Recipe"/.test(text)) return undefined;
  const blocks = [...text.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  if (!blocks.length) blocks.push(text);
  for (const block of blocks) {
    let doc: unknown;
    try {
      doc = JSON.parse(block.trim());
    } catch {
      continue;
    }
    const recipe = findRecipeNode(doc);
    if (!recipe) continue;
    const str = (v: unknown) => (typeof v === "string" ? decodeEntities(v).trim() : "");
    const steps: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") steps.push(...decodeEntities(v).split(/\n+/).map(stepText).filter(Boolean));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (o.itemListElement) walk(o.itemListElement);
        else walk(o.text ?? o.name);
      }
    };
    walk(recipe.recipeInstructions);
    const servingsText = Array.isArray(recipe.recipeYield) ? String(recipe.recipeYield[0]) : String(recipe.recipeYield ?? "");
    const parsed: Parsed = {
      title: str(recipe.name).slice(0, 150) || "Untitled recipe",
      ingredients: (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []).map(str).filter(Boolean),
      steps,
    };
    const servings = readNumber(servingsText.replace(/^\D+/, ""))?.value;
    if (servings) parsed.servings = Math.round(servings);
    const prep = recipe.prepTime ? parseDuration(String(recipe.prepTime)) : undefined;
    const cook = recipe.cookTime ? parseDuration(String(recipe.cookTime)) : undefined;
    if (prep !== undefined) parsed.prepMinutes = prep;
    if (cook !== undefined) parsed.cookMinutes = cook;
    if (typeof recipe.url === "string") parsed.source = recipe.url;
    const keywords = [recipe.recipeCategory, recipe.recipeCuisine].flat().filter((k): k is string => typeof k === "string");
    if (keywords.length) parsed.tags = cleanTags(keywords);
    return parsed;
  }
  return undefined;
}

function findRecipeNode(doc: unknown): Record<string, any> | undefined {
  if (Array.isArray(doc)) {
    for (const d of doc) {
      const found = findRecipeNode(d);
      if (found) return found;
    }
    return undefined;
  }
  if (!doc || typeof doc !== "object") return undefined;
  const o = doc as Record<string, any>;
  const type = o["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return o;
  return findRecipeNode(o["@graph"]);
}

function decodeEntities(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// -- showing ---------------------------------------------------------------------------------------------------

export interface ShownIngredient {
  heading?: string;
  amount?: string;          // "1 ½ cups"
  name?: string;
  note?: string;
  optional?: boolean;
  raw: string;
}

/** The ingredient lines for ``servings`` people, in the chosen units ("as-written" keeps the recipe's own). */
export function shownIngredients(recipe: Recipe, servings = recipe.servings, units: System | "as-written" = "as-written"): ShownIngredient[] {
  const factor = servings / recipe.servings;
  return recipe.ingredients.map((raw) => {
    const line: IngredientLine = parseIngredient(raw);
    if (isHeading(line)) return { heading: line.heading, raw };
    const out: ShownIngredient = { name: line.name, raw };
    if (line.amount) {
      let amount: Amount = factor === 1 ? line.amount : tidy(scale(line.amount, factor));
      if (units !== "as-written") amount = convert(amount, units);
      out.amount = format(amount);
    }
    if (line.note) out.note = line.note;
    if (line.optional) out.optional = true;
    return out;
  });
}

// -- finding ---------------------------------------------------------------------------------------------------

/** All words must appear in the title, ingredients, tags or notes; title matches come first. */
export function search(recipes: Recipe[], query: string, tag?: string): Recipe[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored: { r: Recipe; score: number }[] = [];
  for (const r of recipes) {
    if (tag && !r.tags.includes(tag)) continue;
    const title = r.title.toLowerCase();
    const rest = [...r.ingredients, ...r.tags, r.notes ?? ""].join(" ").toLowerCase();
    if (!words.every((w) => title.includes(w) || rest.includes(w))) continue;
    const score = words.filter((w) => title.includes(w)).length * 10 + (r.favorite ? 2 : 0) + (r.rating ?? 0);
    scored.push({ r, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title)).map((s) => s.r);
}

export function allTags(recipes: Recipe[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
