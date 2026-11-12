/** The recipe list, one recipe (with scaling), and cook mode. */

import { h, toast } from "./dom.js";
import * as store from "./state.js";
import { type Recipe, allTags, applyEdit, formatMinutes, makeRecipe, search, shownIngredients } from "../core/recipes.js";
import { SAMPLES } from "./samples.js";
import { localToday } from "../core/planner.js";
import { addToPlanDialog } from "./planner-view.js";

export function findRecipe(id: string): Recipe | undefined {
  return store.state().recipes.find((r) => r.id === id);
}

/** A link to the recipe's web page, or the source as text. A malformed address ("https://") is shown as
 *  text instead of breaking the page, which is what new URL() throwing used to do. */
function sourceLink(source: string): Node | string {
  if (!/^https?:\/\//i.test(source)) return source;
  try {
    const host = new URL(source).hostname.replace(/^www\./, "");
    if (!host) return source;
    return h("a", { href: source, rel: "noopener noreferrer", target: "_blank" }, host);
  } catch {
    return source;
  }
}

function time(r: Recipe): string | undefined {
  const total = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
  return total ? formatMinutes(total) : undefined;
}

export function recipeList(query: URLSearchParams): Node {
  const { recipes } = store.state();
  const q = query.get("q") ?? "";
  const tag = query.get("tag") ?? undefined;
  if (!recipes.length) {
    return h("section", { class: "empty" },
      h("h1", {}, "Your recipe box is empty"),
      h("p", {}, "Add your own recipes, paste one you found, or start with a few examples."),
      h("div", {},
        h("a", { class: "btn primary", href: "#/new" }, "Write a recipe"),
        h("a", { class: "btn", href: "#/import" }, "Paste a recipe"),
        h("button", { class: "btn", type: "button", onclick: () => store.update((s) => {
          for (const sample of SAMPLES) s.recipes.push(makeRecipe(sample));
        }, `added ${SAMPLES.length} example recipes`) }, "Add examples")));
  }
  const found = search(recipes, q, tag);
  const setQuery = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(tag ? { tag } : {}) });
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v); else params.delete(k);
    const s = params.toString();
    history.replaceState(null, "", `#/recipes${s ? "?" + s : ""}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const input = h("input", { type: "search", placeholder: "Search recipes or ingredients", "aria-label": "Search recipes", value: q,
    oninput: (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      clearTimeout((input as any)._t);
      (input as any)._t = setTimeout(() => {
        setQuery({ q: value || undefined });
        const again = document.querySelector<HTMLInputElement>('input[type="search"]');
        again?.focus();
        again?.setSelectionRange(value.length, value.length);
      }, 200);
    } });
  return h("section", {},
    h("div", { class: "row spread" },
      h("h1", {}, "Recipes"),
      h("div", { class: "row" },
        h("a", { class: "btn", href: "#/import" }, "Paste"),
        h("a", { class: "btn primary", href: "#/new" }, "+ New recipe"))),
    input,
    h("div", { class: "row", style: "margin-top:.7rem" },
      allTags(recipes).slice(0, 14).map(({ tag: t, count }) => h("button", {
        type: "button", class: `chip${t === tag ? " on" : ""}`, "aria-pressed": t === tag ? "true" : "false",
        onclick: () => setQuery({ tag: t === tag ? undefined : t }) }, `${t} (${count})`))),
    found.length
      ? h("div", { class: "recipes" }, found.map((r) => h("a", { class: "card recipe-card", href: `#/recipe/${r.id}` },
          h("h2", {}, r.favorite ? h("span", { class: "star", "aria-label": "favourite" }, "★ ") : null, r.title),
          h("span", { class: "muted small" }, `${r.ingredients.length} ingredients${time(r) ? ` · ${time(r)}` : ""} · serves ${r.servings}`),
          r.tags.length ? h("span", { class: "meta row" }, r.tags.slice(0, 4).map((t) => h("span", { class: "chip" }, t))) : null)))
      : h("p", { class: "empty" }, "No recipes match. ", h("a", { href: "#/recipes" }, "Show all")));
}

export function recipePage(id: string, query: URLSearchParams): Node {
  const recipe = findRecipe(id);
  if (!recipe) return h("div", { class: "empty" }, h("h1", {}, "Recipe not found"), h("a", { class: "btn", href: "#/recipes" }, "Back to recipes"));
  const s = store.state();
  const servings = Math.max(1, Math.min(500, Number(query.get("serves")) || recipe.servings));
  const units = (query.get("units") as "as-written" | "us" | "metric" | null) ?? s.settings.units;
  const go = (serves: number, u = units) => {
    const params = new URLSearchParams();
    if (serves !== recipe.servings) params.set("serves", String(serves));
    if (u !== s.settings.units) params.set("units", u);
    history.replaceState(null, "", `#/recipe/${recipe.id}${params.size ? "?" + params : ""}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const lines = shownIngredients(recipe, servings, units);
  const scaled = servings !== recipe.servings;
  return h("article", { class: "stack" },
    h("div", { class: "recipe-head" },
      h("div", { class: "grow" },
        h("a", { href: "#/recipes", class: "small no-print" }, "← All recipes"),
        h("h1", {}, recipe.title),
        h("div", { class: "facts" },
          recipe.prepMinutes ? h("span", {}, "Prep ", h("strong", {}, formatMinutes(recipe.prepMinutes))) : null,
          recipe.cookMinutes ? h("span", {}, "Cook ", h("strong", {}, formatMinutes(recipe.cookMinutes))) : null,
          recipe.source ? h("span", {}, "From ", sourceLink(recipe.source)) : null),
        recipe.tags.length ? h("div", { class: "row", style: "margin-top:.5rem" },
          recipe.tags.map((t) => h("a", { class: "chip", href: `#/recipes?tag=${encodeURIComponent(t)}` }, t))) : null),
      h("div", { class: "row no-print" },
        h("button", { class: "btn icon", type: "button", "aria-label": recipe.favorite ? "Remove from favourites" : "Add to favourites",
          title: "Favourite", onclick: () => store.update((st) => {
            st.recipes = st.recipes.map((r) => (r.id === recipe.id ? applyEdit(r, { favorite: !recipe.favorite }) : r));
          }) }, recipe.favorite ? "★" : "☆"),
        h("a", { class: "btn", href: `#/edit/${recipe.id}` }, "Edit"),
        h("button", { class: "btn", type: "button", onclick: () => addToPlanDialog(recipe, servings, localToday()) }, "Add to plan"),
        recipe.steps.length ? h("a", { class: "btn primary", href: `#/cook/${recipe.id}${scaled ? `?serves=${servings}` : ""}` }, "Cook") : null)),
    h("div", { class: "columns" },
      h("section", { class: "card" },
        h("div", { class: "row spread" },
          h("h2", {}, "Ingredients"),
          h("div", { class: "stepper no-print", role: "group", "aria-label": "Servings" },
            h("button", { type: "button", "aria-label": "Fewer servings", onclick: () => go(Math.max(1, servings - 1)) }, "−"),
            h("output", { "aria-live": "polite" }, `serves ${servings}`),
            h("button", { type: "button", "aria-label": "More servings", onclick: () => go(servings + 1) }, "+"))),
        scaled ? h("p", { class: "small muted" }, `Scaled from ${recipe.servings}. `,
          h("button", { type: "button", class: "chip", onclick: () => go(recipe.servings) }, "Reset")) : null,
        h("label", { class: "small muted no-print", style: "font-weight:400;margin:.4rem 0" }, "Units ",
          h("select", { style: "width:auto;padding:.2rem .4rem", onchange: (e: Event) => go(servings, (e.target as HTMLSelectElement).value as typeof units) },
            [["as-written", "as written"], ["us", "cups and ounces"], ["metric", "grams and ml"]].map(([v, label]) =>
              h("option", { value: v, selected: v === units }, label)))),
        lines.length ? h("ul", { class: "ingredients" }, lines.map((l) => l.heading
          ? h("li", { class: "heading" }, l.heading)
          : h("li", {}, h("span", { class: "amt" }, l.amount ?? ""),
              h("span", {}, l.name, l.note ? h("span", { class: "note" }, `, ${l.note}`) : null,
                l.optional ? h("span", { class: "opt" }, " (optional)") : null))))
          : h("p", { class: "muted" }, "No ingredients yet.")),
      h("section", { class: "card" },
        h("h2", {}, "Method"),
        recipe.steps.length ? h("ol", { class: "steps" }, recipe.steps.map((st) => h("li", {}, st))) : h("p", { class: "muted" }, "No steps yet."),
        recipe.notes ? [h("h2", { style: "margin-top:1.2rem" }, "Notes"), h("p", { style: "white-space:pre-line" }, recipe.notes)] : null)));
}

let wakeLock: { release(): Promise<void> } | undefined;

async function keepScreenOn(on: boolean): Promise<void> {
  try {
    if (on && !wakeLock && "wakeLock" in navigator) wakeLock = await (navigator as any).wakeLock.request("screen");
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = undefined;
    }
  } catch {
    /* not supported, or refused: cooking still works */
  }
}

window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#/cook/")) void keepScreenOn(false);
});

export function cookMode(id: string, query: URLSearchParams): Node {
  const recipe = findRecipe(id);
  if (!recipe || !recipe.steps.length) return h("div", { class: "empty" }, h("p", {}, "There are no steps to cook from."), h("a", { class: "btn", href: "#/recipes" }, "Back"));
  void keepScreenOn(true);
  const servings = Number(query.get("serves")) || recipe.servings;
  const step = Math.min(Math.max(0, Number(query.get("step")) || 0), recipe.steps.length - 1);
  const goto = (n: number) => {
    const params = new URLSearchParams({ step: String(n) });
    if (servings !== recipe.servings) params.set("serves", String(servings));
    history.replaceState(null, "", `#/cook/${recipe.id}?${params}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const last = step === recipe.steps.length - 1;
  const onKey = (e: KeyboardEvent) => {
    if (!location.hash.startsWith(`#/cook/${recipe.id}`)) return window.removeEventListener("keydown", onKey);
    if (e.key === "ArrowRight" && !last) { window.removeEventListener("keydown", onKey); goto(step + 1); }
    if (e.key === "ArrowLeft" && step > 0) { window.removeEventListener("keydown", onKey); goto(step - 1); }
  };
  window.addEventListener("keydown", onKey);
  const lines = shownIngredients(recipe, servings, store.state().settings.units);
  return h("section", { class: "cook" },
    h("div", { class: "row spread" },
      h("a", { href: `#/recipe/${recipe.id}${servings !== recipe.servings ? `?serves=${servings}` : ""}` }, "← Recipe"),
      h("span", { class: "muted" }, `Step ${step + 1} of ${recipe.steps.length}`)),
    h("h1", { style: "margin-top:.8rem" }, recipe.title),
    h("div", { class: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": recipe.steps.length, "aria-valuenow": step + 1 },
      h("div", { style: `width:${((step + 1) / recipe.steps.length) * 100}%` })),
    h("p", { class: "step-text", "aria-live": "polite" }, recipe.steps[step]!),
    h("div", { class: "row spread" },
      h("button", { class: "btn", type: "button", disabled: step === 0, onclick: () => goto(step - 1) }, "← Back"),
      last ? h("a", { class: "btn primary", href: `#/recipe/${recipe.id}`, onclick: () => toast("Enjoy your meal!") }, "Done")
           : h("button", { class: "btn primary", type: "button", onclick: () => goto(step + 1) }, "Next →")),
    h("details", { class: "card", style: "margin-top:2rem" },
      h("summary", { style: "cursor:pointer;font-weight:600" }, `Ingredients (serves ${servings})`),
      h("ul", { class: "ingredients" }, lines.map((l) => l.heading ? h("li", { class: "heading" }, l.heading)
        : h("li", {}, h("span", { class: "amt" }, l.amount ?? ""), h("span", {}, l.name, l.note ? h("span", { class: "note" }, `, ${l.note}`) : null))))),
    h("p", { class: "small muted", style: "margin-top:1rem" }, "The screen stays on while you cook. Arrow keys move between steps."));
}
