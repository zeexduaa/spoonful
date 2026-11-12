/** The app's state, kept in the browser's storage, and the one way to change it. */

import { type State, STORAGE_KEY, StorageError, emptyState, load, save } from "../core/storage.js";
import { toast } from "./dom.js";

let current: State = emptyState();
let loadError: string | undefined;
let readOnly = false;        // the saved data couldn't be read: don't overwrite it
const listeners: (() => void)[] = [];

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;            // storage turned off (some private modes)
  }
}

export function init(): void {
  const kv = storage();
  if (!kv) {
    loadError = "This browser isn't letting spoonful save anything, so changes will be lost when you close the page.";
    return;
  }
  try {
    current = load(kv);
  } catch (err) {
    // Don't overwrite what's there: it may be recoverable, or from a newer version.
    loadError = err instanceof StorageError ? err.message : "the saved data couldn't be read";
    current = emptyState();
    readOnly = true;
  }
}

export function state(): State {
  return current;
}

export function problem(): string | undefined {
  return loadError;
}

/**
 * Applies a change, saves it, and redraws. The change is applied to the latest saved state, not
 * this tab's copy: with spoonful open in two tabs, saving the older copy would silently undo
 * what the other tab saved (a recipe added there would vanish).
 */
export function update(change: (s: State) => void, message?: string): void {
  const kv = storage();
  if (kv && !readOnly) {
    try {
      current = load(kv);
    } catch {
      /* keep this tab's copy */
    }
  }
  change(current);
  if (kv && !readOnly) {
    try {
      save(kv, current);
    } catch (err) {
      toast(err instanceof Error ? err.message : "couldn't save");
    }
  }
  if (message) toast(message);
  for (const l of listeners) l();
}

/** Replaces everything (restoring a backup). Clears a read-only state, since the user chose new data. */
export function replace(next: State, message?: string): void {
  readOnly = false;
  loadError = undefined;
  update(() => {
    current = next;
  }, message);
}

export function onChange(listener: () => void): void {
  listeners.push(listener);
}

/**
 * Another tab saved: pick up its changes. Pages with a form being filled in aren't redrawn
 * (that would throw away what's been typed); they pick the changes up on their next save.
 */
export function watchOtherTabs(isEditing: () => boolean): void {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || readOnly) return;
    const kv = storage();
    if (!kv) return;
    try {
      current = load(kv);
    } catch {
      return;
    }
    if (!isEditing()) for (const l of listeners) l();
  });
}
