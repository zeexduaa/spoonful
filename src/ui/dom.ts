/**
 * A small helper for building the page. Text always goes in as text (never as
 * HTML), so a recipe someone pasted can't run scripts in the app.
 */

type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, string | number | boolean | undefined | ((e: any) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(name.replace(/^on/, "").toLowerCase(), value);
    else if (value === true) el.setAttribute(name, "");
    else if (name === "value" && "value" in el) (el as HTMLInputElement).value = String(value);
    else el.setAttribute(name, String(value));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function render(target: HTMLElement, ...children: Child[]): void {
  target.replaceChildren();
  append(target, children);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/** Lets the user save a file the app made (a backup, a shopping list). */
export function download(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
