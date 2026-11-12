/** Settings, backups and restoring them. */

import { download, h, toast } from "./dom.js";
import * as store from "./state.js";
import { StorageError, emptyState, merge, parseState } from "../core/storage.js";
import { localToday } from "../core/planner.js";
import { VERSION } from "../version.js";

export function settings(): Node {
  const s = store.state();
  const units = h("select", { onchange: (e: Event) => store.update((st) => {
    st.settings.units = (e.target as HTMLSelectElement).value as typeof st.settings.units;
  }, "saved") }, [["as-written", "As each recipe is written"], ["us", "Cups, spoons and ounces"], ["metric", "Grams and millilitres"]]
    .map(([v, label]) => h("option", { value: v, selected: s.settings.units === v }, label)));
  const weekStart = h("select", { onchange: (e: Event) => store.update((st) => {
    st.settings.weekStart = (e.target as HTMLSelectElement).value === "sun" ? "sun" : "mon";
  }, "saved") }, [["mon", "Monday"], ["sun", "Sunday"]].map(([v, label]) => h("option", { value: v, selected: s.settings.weekStart === v }, label)));
  const servings = h("input", { type: "number", min: 1, max: 50, value: s.settings.defaultServings, onchange: (e: Event) => {
    const n = Number((e.target as HTMLInputElement).value);
    if (n >= 1 && n <= 50) store.update((st) => { st.settings.defaultServings = Math.round(n); }, "saved");
  } });
  const staples = h("textarea", { rows: 3 });
  staples.value = s.settings.staples.join(", ");
  staples.addEventListener("change", () => store.update((st) => {
    st.settings.staples = staples.value.split(",").map((x) => x.trim()).filter(Boolean);
  }, "saved"));
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  let mode: "merge" | "replace" = "merge";
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (!chosen) return;
    try {
      const incoming = parseState(JSON.parse(await chosen.text()));
      if (mode === "replace") {
        if (!confirm(`Replace everything with this backup (${incoming.recipes.length} recipes)? What's here now will be gone.`)) return;
        store.replace(incoming, `restored ${incoming.recipes.length} recipes`);
      } else {
        const { state, added, updated } = merge(store.state(), incoming);
        store.replace(state, `added ${added} recipe${added === 1 ? "" : "s"}${updated ? `, updated ${updated}` : ""}`);
      }
    } catch (err) {
      toast(err instanceof StorageError ? err.message : "that file isn't a spoonful backup");
    }
  });
  const field = (label: string, input: HTMLElement, hint?: string) =>
    h("div", { class: "field" }, h("label", {}, label, hint ? h("span", { class: "hint" }, ` ${hint}`) : null), input);
  return h("section", { class: "stack" },
    h("h1", {}, "Settings"),
    h("div", { class: "card" },
      field("Show amounts in", units),
      field("Weeks start on", weekStart),
      field("New recipes serve", servings),
      field("Always in the cupboard", staples, "left off shopping lists; separated by commas")),
    h("div", { class: "card stack" },
      h("h2", {}, "Your data"),
      h("p", { class: "muted", style: "margin:0" }, `${s.recipes.length} recipes, stored only in this browser on this device. `,
        "Download a backup now and then, and to move your recipes to another device."),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: () => {
          download(`spoonful-backup-${localToday()}.json`, JSON.stringify(store.state(), null, 1));
          toast("backup downloaded");
        } }, "Download backup"),
        h("button", { class: "btn", type: "button", onclick: () => { mode = "merge"; file.click(); } }, "Add from a backup"),
        h("button", { class: "btn", type: "button", onclick: () => { mode = "replace"; file.click(); } }, "Restore a backup"),
        file),
      h("details", {}, h("summary", { class: "small", style: "cursor:pointer" }, "Start over"),
        h("p", { class: "small muted" }, "Deletes every recipe, the plan and the shopping list from this browser."),
        h("button", { class: "btn danger small", type: "button", onclick: () => {
          if (confirm("Delete everything? Download a backup first if you might want it back.")) store.replace(emptyState(), "everything deleted");
        } }, "Delete everything"))),
    h("p", { class: "small muted" }, `spoonful ${VERSION}. Works offline once loaded, and can be installed from your browser's menu ("Install app" or "Add to Home Screen"). `,
      h("a", { href: "https://github.com/zeexduaa/spoonful", rel: "noopener" }, "Source code")));
}
