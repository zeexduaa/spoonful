/** Writing or editing a recipe, and pasting one in. */

import { h, toast } from "./dom.js";
import * as store from "./state.js";
import { type Recipe, RecipeError, applyEdit, makeRecipe, parseRecipeText, shownIngredients } from "../core/recipes.js";
import { prune } from "../core/planner.js";

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** Steps are separated by blank lines or numbers; a long pasted paragraph stays one step. */
function stepsFrom(text: string): string[] {
  const byLine = lines(text);
  return byLine.map((l) => l.replace(/^(step\s*)?\d+\s*[.):-]\s*/i, ""));
}

export function editor(id: string | undefined): Node {
  const existing = id ? store.state().recipes.find((r) => r.id === id) : undefined;
  if (id && !existing) return h("div", { class: "empty" }, h("h1", {}, "Recipe not found"), h("a", { class: "btn", href: "#/recipes" }, "Back"));
  const draft = existing ?? pendingImport ?? undefined;
  pendingImport = undefined;
  const field = (label: string, input: HTMLElement, hint?: string) =>
    h("div", { class: "field" }, h("label", {}, label, hint ? h("span", { class: "hint" }, ` ${hint}`) : null), input);
  const title = h("input", { type: "text", required: true, maxlength: 150, value: draft?.title ?? "", placeholder: "e.g. Grandma's dal" });
  const servings = h("input", { type: "number", min: 1, max: 500, step: 1, value: draft?.servings ?? store.state().settings.defaultServings });
  const prep = h("input", { type: "number", min: 0, step: 1, value: draft?.prepMinutes ?? "", placeholder: "minutes" });
  const cook = h("input", { type: "number", min: 0, step: 1, value: draft?.cookMinutes ?? "", placeholder: "minutes" });
  const ingredients = h("textarea", { rows: 10, placeholder: "One per line, e.g.\n2 cups rice\n1 large onion, chopped\nFor the sauce:\n2 tbsp soy sauce" });
  ingredients.value = (draft?.ingredients ?? []).join("\n");
  const steps = h("textarea", { rows: 10, placeholder: "One step per line" });
  steps.value = (draft?.steps ?? []).join("\n");
  const tags = h("input", { type: "text", value: (draft?.tags ?? []).join(", "), placeholder: "dinner, vegetarian, quick" });
  const source = h("input", { type: "text", value: draft?.source ?? "", placeholder: "a website, book or person" });
  const notes = h("textarea", { rows: 3 });
  notes.value = draft?.notes ?? "";
  const preview = h("ul", { class: "ingredients small" });
  const refresh = () => {
    const sample = makeRecipe({ title: "preview", ingredients: lines(ingredients.value) });
    preview.replaceChildren(...shownIngredients(sample).map((l) => l.heading ? h("li", { class: "heading" }, l.heading)
      : h("li", {}, h("span", { class: "amt" }, l.amount ?? "—"), h("span", {}, l.name, l.note ? h("span", { class: "note" }, `, ${l.note}`) : null))));
  };
  ingredients.addEventListener("input", refresh);
  refresh();
  const error = h("p", { class: "card", role: "alert", hidden: true, style: "color:var(--danger)" });

  const onsubmit = (e: Event) => {
    e.preventDefault();
    const input = {
      title: title.value, servings: Number(servings.value), ingredients: lines(ingredients.value), steps: stepsFrom(steps.value),
      prepMinutes: Number(prep.value) || 0, cookMinutes: Number(cook.value) || 0, tags: tags.value.split(","), source: source.value,
      notes: notes.value,
    };
    try {
      let saved: Recipe;
      if (existing) {
        saved = applyEdit(existing, input);
        store.update((s) => { s.recipes = s.recipes.map((r) => (r.id === saved.id ? saved : r)); }, "saved");
      } else {
        saved = makeRecipe(input);
        store.update((s) => { s.recipes.push(saved); }, "recipe added");
      }
      location.hash = `#/recipe/${saved.id}`;
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof RecipeError ? err.message : "something went wrong";
      error.scrollIntoView({ block: "center" });
    }
  };

  const remove = () => {
    if (!existing || !confirm(`Delete "${existing.title}"? It's also taken off your meal plan.`)) return;
    store.update((s) => {
      s.recipes = s.recipes.filter((r) => r.id !== existing.id);
      prune(s.plan, new Set(s.recipes.map((r) => r.id)));
    }, "recipe deleted");
    location.hash = "#/recipes";
  };

  return h("form", { class: "stack", onsubmit, novalidate: true },
    h("div", { class: "row spread" },
      h("h1", {}, existing ? `Edit ${existing.title}` : "New recipe"),
      existing ? h("button", { type: "button", class: "btn danger", onclick: remove }, "Delete") : h("a", { class: "btn", href: "#/import" }, "Paste instead")),
    error,
    h("div", { class: "card" },
      field("Name", title),
      h("div", { class: "grid2", style: "margin-top:1rem" }, field("Serves", servings), field("Prep time", prep), field("Cook time", cook))),
    h("div", { class: "columns" },
      h("div", { class: "card" }, field("Ingredients", ingredients, "one per line; a line ending in ':' starts a section")),
      h("div", { class: "card" }, h("label", {}, "How spoonful reads them"), preview)),
    h("div", { class: "card" }, field("Method", steps, "one step per line")),
    h("div", { class: "card" }, field("Tags", tags, "separated by commas"), field("Source", source), field("Notes", notes)),
    h("div", { class: "row" },
      h("button", { class: "btn primary", type: "submit" }, existing ? "Save" : "Add recipe"),
      h("a", { class: "btn", href: existing ? `#/recipe/${existing.id}` : "#/recipes" }, "Cancel")));
}

/** A pasted recipe waiting to be checked in the editor. */
let pendingImport: (Partial<Recipe> & { title: string }) | undefined;

export function importer(): Node {
  const text = h("textarea", { rows: 16, "aria-label": "Recipe text",
    placeholder: "Paste a recipe here: its name on the first line, then the ingredients and method.\n\nYou can also paste a recipe web page's source (View source, select all, copy): many sites include the recipe in a form spoonful reads exactly." });
  const error = h("p", { role: "alert", style: "color:var(--danger)", hidden: true });
  const read = (e: Event) => {
    e.preventDefault();
    try {
      const parsed = parseRecipeText(text.value);
      const draft: Partial<Recipe> & { title: string } = { title: parsed.title, ingredients: parsed.ingredients, steps: parsed.steps };
      if (parsed.servings) draft.servings = parsed.servings;
      if (parsed.prepMinutes) draft.prepMinutes = parsed.prepMinutes;
      if (parsed.cookMinutes) draft.cookMinutes = parsed.cookMinutes;
      if (parsed.notes) draft.notes = parsed.notes;
      if (parsed.source) draft.source = parsed.source;
      if (parsed.tags) draft.tags = parsed.tags;
      pendingImport = draft;
      toast(`read ${parsed.ingredients.length} ingredients and ${parsed.steps.length} steps: check them, then add`);
      location.hash = "#/new";
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof RecipeError ? err.message : "couldn't read that";
    }
  };
  return h("form", { class: "stack", onsubmit: read },
    h("h1", {}, "Paste a recipe"),
    h("p", { class: "muted" }, "Copy a recipe from a website, an email or a document and paste it below. spoonful finds the name, servings, times, ingredients and steps, and you can check everything before it's saved."),
    text, error,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, "Read recipe"), h("a", { class: "btn", href: "#/recipes" }, "Cancel")));
}
