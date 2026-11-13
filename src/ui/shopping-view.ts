/** The shopping list for a week of the plan, plus anything added by hand. */

import { download, h, toast } from "./dom.js";
import * as store from "./state.js";
import { countMeals, localToday, shoppingList, weekOf, addDays } from "../core/planner.js";
import { newId } from "../core/recipes.js";

export function shopping(query: URLSearchParams): Node {
  const s = store.state();
  const start = query.get("week") ?? localToday();
  const days = weekOf(/^\d{4}-\d{2}-\d{2}$/.test(start) ? start : localToday(), s.settings.weekStart);
  const groups = shoppingList(s.plan, s.recipes, days, s.settings.staples);
  const checked = new Set(s.shopping.checked);
  const weekKey = (key: string) => `${days[0]}|${key}`;
  const toggle = (key: string) => store.update((st) => {
    const k = weekKey(key);
    st.shopping.checked = st.shopping.checked.includes(k) ? st.shopping.checked.filter((x) => x !== k) : [...st.shopping.checked, k];
  });
  const extra = h("input", { type: "text", placeholder: "Add something else: dish soap, coffee…", "aria-label": "Add an item" });
  const meals = countMeals(s.plan, days);
  const total = groups.reduce((n, g) => n + g.lines.length, 0) + s.shopping.extras.length;
  const done = groups.reduce((n, g) => n + g.lines.filter((l) => checked.has(weekKey(l.key))).length, 0) +
               s.shopping.extras.filter((x) => x.done).length;

  const asText = () => [
    `Shopping for ${days[0]} to ${days[6]}`,
    ...groups.flatMap((g) => [``, g.aisle.toUpperCase(), ...g.lines.map((l) => `[ ] ${l.name}${l.amounts.length ? ` – ${l.amounts.join(" + ")}` : ""}`)]),
    ...(s.shopping.extras.length ? ["", "OTHER", ...s.shopping.extras.map((x) => `[ ] ${x.text}`)] : []),
  ].join("\n");

  const share = async () => {
    const text = asText();
    try {
      if (navigator.share) await navigator.share({ title: "Shopping list", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("copied: paste it into a message or notes");
      }
    } catch (err) {
      // Closing the share sheet is a choice, not a failure: don't download a file nobody asked for.
      if (err instanceof DOMException && err.name === "AbortError") return;
      download("shopping-list.txt", text, "text/plain");
    }
  };

  return h("section", {},
    h("div", { class: "row spread" },
      h("div", {}, h("h1", {}, "Shopping list"),
        h("p", { class: "muted", style: "margin:0" }, meals ? `${meals} planned meal${meals === 1 ? "" : "s"}, ${days[0]} to ${days[6]}` : "Nothing planned this week yet.")),
      h("div", { class: "row no-print" },
        h("a", { class: "btn small", href: `#/shop?week=${addDays(days[0]!, -7)}`, "aria-label": "Previous week" }, "←"),
        h("a", { class: "btn small", href: `#/shop?week=${addDays(days[0]!, 7)}`, "aria-label": "Next week" }, "→"),
        total ? h("button", { class: "btn small", type: "button", onclick: share }, "Share") : null,
        total ? h("button", { class: "btn small", type: "button", onclick: () => window.print() }, "Print") : null)),
    total ? h("p", { class: "small muted no-print" }, `${done} of ${total} in the basket`) : null,
    groups.map((g) => h("div", { class: "aisle" }, h("h2", {}, g.aisle),
      g.lines.map((l) => {
        const isDone = checked.has(weekKey(l.key));
        return h("label", { class: `shop-item${isDone ? " done" : ""}` },
          h("input", { type: "checkbox", checked: isDone, onchange: () => toggle(l.key) }),
          h("span", { class: "what" }, h("strong", {}, l.name), l.amounts.length ? ` – ${l.amounts.join(" + ")}` : "",
            h("span", { class: "for" }, `for ${l.recipes.join(", ")}`)));
      }))),
    h("div", { class: "aisle" }, h("h2", {}, "Other"),
      s.shopping.extras.map((x) => h("label", { class: `shop-item${x.done ? " done" : ""}` },
        h("input", { type: "checkbox", checked: !!x.done, onchange: () => store.update((st) => {
          st.shopping.extras = st.shopping.extras.map((e) => (e.id === x.id ? { ...e, done: !e.done } : e));
        }) }),
        h("span", { class: "what" }, x.text),
        h("button", { class: "btn small no-print", type: "button", "aria-label": `Remove ${x.text}`, onclick: (e: Event) => {
          e.preventDefault();
          store.update((st) => { st.shopping.extras = st.shopping.extras.filter((y) => y.id !== x.id); });
        } }, "×"))),
      h("form", { class: "row no-print", style: "margin-top:.6rem", onsubmit: (e: Event) => {
        e.preventDefault();
        const text = extra.value.trim();
        if (!text) return;
        store.update((st) => { st.shopping.extras.push({ id: newId(), text: text.slice(0, 200) }); });
        setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Add an item"]')?.focus(), 0);
      } }, h("div", { class: "grow" }, extra), h("button", { class: "btn", type: "submit" }, "Add"))),
    done ? h("div", { class: "row no-print", style: "margin-top:1rem" },
      h("button", { class: "btn small", type: "button", onclick: () => store.update((st) => {
        st.shopping.checked = st.shopping.checked.filter((k) => !k.startsWith(`${days[0]}|`));
        st.shopping.extras = st.shopping.extras.filter((x) => !x.done);
      }, "cleared") }, "Clear ticked items")) : null,
    meals ? null : h("p", { class: "empty" }, "Plan some meals and their ingredients appear here, added up and sorted by aisle. ",
      h("a", { href: `#/plan?week=${days[0]}` }, "Open the plan")),
    groups.length ? h("p", { class: "small muted" }, `Left off because you usually have them: ${s.settings.staples.join(", ")}. Change this in Settings.`) : null);
}
