/**
 * spoonful's web app: the pages, the navigation between them, and offline support.
 *
 * Pages live in the address after "#", so the back button, bookmarks and links work:
 *   #/recipes  #/recipe/ID  #/cook/ID  #/edit/ID  #/new  #/import  #/plan  #/shop  #/settings
 */

import { h, render } from "./dom.js";
import * as store from "./state.js";
import { recipeList, recipePage, cookMode } from "./recipe-views.js";
import { editor, importer } from "./editor.js";
import { planner } from "./planner-view.js";
import { shopping } from "./shopping-view.js";
import { settings } from "./settings-view.js";

const app = document.getElementById("app")!;

interface Route {
  page: string;
  arg?: string;
  query: URLSearchParams;
}

function route(): Route {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path = "", search = ""] = hash.split("?");
  const [page = "recipes", arg] = path.split("/");
  const r: Route = { page: page || "recipes", query: new URLSearchParams(search) };
  if (arg) r.arg = decodeURIComponent(arg);
  return r;
}

let lastPage = "";

function draw(): void {
  const r = route();
  const tab = ["plan", "shop", "settings"].includes(r.page) ? r.page : "recipes";
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".tabs a")) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const views: Record<string, () => Node> = {
    recipes: () => recipeList(r.query),
    recipe: () => recipePage(r.arg ?? "", r.query),
    cook: () => cookMode(r.arg ?? "", r.query),
    edit: () => editor(r.arg),
    new: () => editor(undefined),
    import: () => importer(),
    plan: () => planner(r.query),
    shop: () => shopping(r.query),
    settings: () => settings(),
  };
  const view = views[r.page] ?? (() => h("div", { class: "empty" }, h("p", {}, "There's no such page."),
                                            h("a", { class: "btn", href: "#/recipes" }, "Go to your recipes")));
  const problem = store.problem();
  render(app, problem ? h("p", { class: "card", role: "alert" }, problem) : null, view());
  const pageKey = `${r.page}/${r.arg ?? ""}`;
  if (pageKey !== lastPage) {
    window.scrollTo(0, 0);
    const heading = app.querySelector("h1");
    document.title = heading?.textContent ? `${heading.textContent} · spoonful` : "spoonful";
    lastPage = pageKey;
  }
}

store.init();
store.onChange(draw);
window.addEventListener("hashchange", draw);
draw();

// Offline support: cache the app so it opens without a connection, and can be installed.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => { /* still works online */ });
}
