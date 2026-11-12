/**
 * Where spoonful keeps everything: the browser's own storage on this device.
 *
 * The whole state is one versioned JSON document. Older versions are upgraded
 * step by step when loaded; one from a newer spoonful is refused (and left
 * untouched) instead of being overwritten. Backups are the same document as a
 * file you can download, keep elsewhere, and restore, either replacing everything
 * or merging (a recipe present in both keeps whichever copy was edited last).
 */

import { type Recipe, cleanTags } from "./recipes.js";
import { type Plan, DEFAULT_STAPLES, SLOTS } from "./planner.js";

export const FORMAT = "spoonful";
export const VERSION = 1;

export interface Settings {
  units: "as-written" | "us" | "metric";
  weekStart: "mon" | "sun";
  staples: string[];
  defaultServings: number;
}

export interface State {
  format: typeof FORMAT;
  version: typeof VERSION;
  recipes: Recipe[];
  plan: Plan;
  shopping: { checked: string[]; extras: { id: string; text: string; done?: boolean }[] };
  settings: Settings;
}

export class StorageError extends Error {
  override name = "StorageError";
}

export function emptyState(): State {
  return { format: FORMAT, version: VERSION, recipes: [], plan: {}, shopping: { checked: [], extras: [] },
           settings: { units: "as-written", weekStart: "mon", staples: [...DEFAULT_STAPLES], defaultServings: 4 } };
}

const MIGRATIONS: Record<number, (doc: any) => any> = {};

/** Checks and repairs a document (from storage or a backup file). Throws StorageError if it isn't one. */
export function parseState(doc: unknown): State {
  if (!doc || typeof doc !== "object") throw new StorageError("that isn't a spoonful backup");
  let d = doc as any;
  if (d.format !== FORMAT || !Number.isInteger(d.version)) throw new StorageError("that isn't a spoonful backup");
  if (d.version > VERSION) throw new StorageError("this was saved by a newer version of spoonful; please update it first");
  while (d.version < VERSION) {
    const step = MIGRATIONS[d.version];
    if (!step) throw new StorageError(`can't upgrade data from version ${d.version}`);
    d = step(d);
    d.version += 1;
  }
  const base = emptyState();
  const recipes: Recipe[] = [];
  for (const r of Array.isArray(d.recipes) ? d.recipes : []) {
    if (!r || typeof r.id !== "string" || typeof r.title !== "string" || !r.title.trim()) continue;
    // Keep only fields of the right kind and range: a backup may have been edited by hand or damaged,
    // and a non-text note or a time of "abc" would otherwise break the pages that show them.
    const clean: Record<string, unknown> = { id: r.id, title: r.title.trim().slice(0, 150) };
    for (const key of ["prepMinutes", "cookMinutes"]) {
      const n = Number(r[key]);
      if (r[key] !== undefined && Number.isFinite(n) && n > 0 && n <= 60 * 24 * 7) clean[key] = Math.round(n);
    }
    for (const key of ["notes", "source"]) if (typeof r[key] === "string" && r[key].trim()) clean[key] = r[key];
    if (r.favorite === true) clean.favorite = true;
    if (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) clean.rating = r.rating;
    recipes.push({
      ...(clean as { id: string; title: string }),
      servings: Number(r.servings) > 0 && Number(r.servings) <= 500 ? Number(r.servings) : 4,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients.filter((x: unknown) => typeof x === "string") : [],
      steps: Array.isArray(r.steps) ? r.steps.filter((x: unknown) => typeof x === "string") : [],
      tags: Array.isArray(r.tags) ? cleanTags(r.tags.filter((x: unknown) => typeof x === "string")) : [],
      created: typeof r.created === "string" ? r.created : new Date(0).toISOString(),
      updated: typeof r.updated === "string" ? r.updated : new Date(0).toISOString(),
    });
  }
  const plan: Plan = {};
  if (d.plan && typeof d.plan === "object") {
    for (const [date, meals] of Object.entries(d.plan)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(meals)) continue;
      const ok = meals.filter((m: any) => m && typeof m.id === "string" && typeof m.recipe === "string" &&
                                          Number(m.servings) > 0 && SLOTS.includes(m.slot));
      if (ok.length) plan[date] = ok;
    }
  }
  const s = d.settings ?? {};
  return {
    format: FORMAT, version: VERSION, recipes, plan,
    shopping: {
      checked: Array.isArray(d.shopping?.checked) ? d.shopping.checked.filter((x: unknown) => typeof x === "string") : [],
      extras: Array.isArray(d.shopping?.extras) ? d.shopping.extras.filter((x: any) => x && typeof x.id === "string" && typeof x.text === "string") : [],
    },
    settings: {
      units: ["as-written", "us", "metric"].includes(s.units) ? s.units : base.settings.units,
      weekStart: s.weekStart === "sun" ? "sun" : "mon",
      staples: Array.isArray(s.staples) ? s.staples.filter((x: unknown) => typeof x === "string") : base.settings.staples,
      defaultServings: Number(s.defaultServings) > 0 ? Number(s.defaultServings) : 4,
    },
  };
}

/** Merges a backup into the current state: new recipes are added, and shared ones keep the later edit. */
export function merge(current: State, incoming: State): { state: State; added: number; updated: number } {
  const byId = new Map(current.recipes.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  for (const r of incoming.recipes) {
    const mine = byId.get(r.id);
    if (!mine) {
      byId.set(r.id, r);
      added++;
    } else if (r.updated > mine.updated) {
      byId.set(r.id, r);
      updated++;
    }
  }
  const plan: Plan = { ...current.plan };
  for (const [date, meals] of Object.entries(incoming.plan)) {
    const have = new Set((plan[date] ?? []).map((m) => m.id));
    plan[date] = [...(plan[date] ?? []), ...meals.filter((m) => !have.has(m.id))];
  }
  return { state: { ...current, recipes: [...byId.values()], plan }, added, updated };
}

/** A key-value store with the shape of localStorage, so tests can use a Map. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = "spoonful";

export function load(kv: KeyValue): State {
  const text = kv.getItem(STORAGE_KEY);
  if (!text) return emptyState();
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new StorageError("the saved data is damaged; restore a backup in Settings");
  }
  return parseState(doc);
}

export function save(kv: KeyValue, state: State): void {
  try {
    kv.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new StorageError("couldn't save: the browser's storage is full or turned off. Download a backup from Settings");
  }
}
