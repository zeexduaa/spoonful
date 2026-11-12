/** The week planner. */

import { h, toast } from "./dom.js";
import * as store from "./state.js";
import { type Slot, SLOTS, addDays, addMeal, copyWeek, countMeals, localToday, moveMeal, removeMeal, weekOf } from "../core/planner.js";
import { type Recipe, newId } from "../core/recipes.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const label = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return { day: DAY_NAMES[d.getDay()]!, date: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
};

/** Choose a recipe, day, meal and servings. Opens from a day ("+ Add") or from a recipe ("Add to plan"). */
/** The meal a recipe is probably for, from its tags ("breakfast" recipes go to breakfast); otherwise dinner. */
export function likelySlot(recipe: Recipe | undefined): Slot {
  const tags = recipe?.tags ?? [];
  return SLOTS.find((slot) => tags.includes(slot) || (slot === "snack" && tags.includes("snacks"))) ?? "dinner";
}

export function addToPlanDialog(recipe: Recipe | undefined, servings: number | undefined, date: string): void {
  const { recipes } = store.state();
  if (!recipes.length) {
    toast("add a recipe first");
    return;
  }
  const pick = h("select", { required: true },
    [...recipes].sort((a, b) => a.title.localeCompare(b.title)).map((r) => h("option", { value: r.id, selected: r.id === recipe?.id }, r.title)));
  const day = h("input", { type: "date", value: date, required: true });
  const first = recipe ?? [...recipes].sort((a, b) => a.title.localeCompare(b.title))[0];
  const slot = h("select", {}, SLOTS.map((s) => h("option", { value: s, selected: s === likelySlot(first) }, s[0]!.toUpperCase() + s.slice(1))));
  const serves = h("input", { type: "number", min: 1, max: 500, value: servings ?? recipe?.servings ?? recipes[0]!.servings });
  pick.addEventListener("change", () => {
    const chosen = recipes.find((r) => r.id === pick.value);
    if (chosen && !servings) serves.value = String(chosen.servings);
    if (chosen) slot.value = likelySlot(chosen);
  });
  const dialog = h("dialog", { "aria-label": "Add to plan" },
    h("form", { method: "dialog", class: "stack", onsubmit: (e: Event) => {
      e.preventDefault();
      const n = Number(serves.value);
      if (!day.value || !(n > 0)) return;
      store.update((s) => addMeal(s.plan, day.value, { recipe: pick.value, servings: n, slot: slot.value as Slot }, newId()),
                   `added to ${label(day.value).day} ${label(day.value).date}`);
      dialog.close();
      dialog.remove();
    } },
      h("h2", {}, "Add to your plan"),
      h("div", {}, h("label", {}, "Recipe"), pick),
      h("div", { class: "grid2" }, h("div", {}, h("label", {}, "Day"), day), h("div", {}, h("label", {}, "Meal"), slot),
        h("div", {}, h("label", {}, "Servings"), serves)),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, "Add"),
        h("button", { class: "btn", type: "button", onclick: () => { dialog.close(); dialog.remove(); } }, "Cancel"))));
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

export function planner(query: URLSearchParams): Node {
  const s = store.state();
  const today = localToday();
  const start = query.get("week") ?? today;
  const days = weekOf(/^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today, s.settings.weekStart);
  const byId = new Map(s.recipes.map((r) => [r.id, r]));
  const go = (date: string) => { location.hash = `#/plan?week=${date}`; };
  const first = label(days[0]!);
  const last = label(days[6]!);
  const meals = countMeals(s.plan, days);
  return h("section", {},
    h("div", { class: "row spread" },
      h("h1", {}, "Meal plan"),
      h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", "aria-label": "Previous week", onclick: () => go(addDays(days[0]!, -7)) }, "←"),
        h("strong", {}, `${first.date} – ${last.date}`),
        h("button", { class: "btn small", type: "button", "aria-label": "Next week", onclick: () => go(addDays(days[0]!, 7)) }, "→"),
        days.includes(today) ? null : h("button", { class: "btn small", type: "button", onclick: () => go(today) }, "This week"))),
    h("div", { class: "row", style: "margin-top:.6rem" },
      h("a", { class: "btn primary", href: `#/shop?week=${days[0]}` }, `Shopping list${meals ? ` (${meals} meals)` : ""}`),
      meals ? h("button", { class: "btn", type: "button", onclick: () => {
        const n = countMeals(s.plan, days.map((d) => addDays(d, 7)));
        if (n && !confirm("Next week already has meals. Add this week's as well?")) return;
        store.update((st) => copyWeek(st.plan, days, newId), "copied to next week");
      } }, "Repeat next week") : null),
    h("div", { class: "week" }, days.map((date) => {
      const l = label(date);
      const list = s.plan[date] ?? [];
      return h("div", { class: `card day${date === today ? " today" : ""}`, "data-date": date,
                         ondragover: (e: DragEvent) => e.preventDefault(),
                         ondrop: (e: DragEvent) => {
                           e.preventDefault();
                           const data = e.dataTransfer?.getData("text/plain");
                           if (!data) return;
                           const [from, mealId] = data.split("|");
                           if (from && mealId && from !== date) store.update((st) => moveMeal(st.plan, from, mealId, date));
                         } },
        h("h3", {}, h("span", {}, l.day), h("span", { class: "muted small" }, l.date)),
        list.map((m) => {
          const r = byId.get(m.recipe);
          return h("div", { class: "meal", draggable: "true", ondragstart: (e: DragEvent) => e.dataTransfer?.setData("text/plain", `${date}|${m.id}`) },
            h("div", { class: "grow" }, h("span", { class: "slot" }, m.slot),
              r ? h("a", { href: `#/recipe/${r.id}${m.servings !== r.servings ? `?serves=${m.servings}` : ""}` }, r.title) : h("em", {}, "deleted recipe"),
              h("span", { class: "muted small" }, ` · ${m.servings}`)),
            h("button", { type: "button", "aria-label": `Remove ${r?.title ?? "meal"} from ${l.day}`, title: "Remove",
                          onclick: () => store.update((st) => removeMeal(st.plan, date, m.id)) }, "×"));
        }),
        h("button", { class: "btn small add", type: "button", onclick: () => addToPlanDialog(undefined, undefined, date) }, "+ Add"));
    })),
    s.recipes.length ? null : h("p", { class: "empty" }, "Add some recipes first, then plan them here. ", h("a", { href: "#/recipes" }, "Go to recipes")));
}
