/**
 * Amounts in recipes: reading them, converting them and writing them nicely.
 *
 * Recipes write amounts many ways: "1 1/2", "1½", "1.5", "½", "2-3", "a", "one",
 * "a dozen". Units are just as varied: "Tbsp", "tablespoons", "T" (tablespoon)
 * versus "t" (teaspoon), "g", "grams", "lb"...
 *
 * Units belong to a dimension: volume (stored as millilitres), mass (grams), or
 * a named count ("clove", "can", "pinch") that can only be added to itself.
 * When a recipe is scaled, amounts are written back in the unit that reads best
 * in the same system: ¾ cup doubled is 1 ½ cups, 3 teaspoons become 1 tablespoon,
 * 1250 g becomes 1.25 kg. Kitchen fractions (⅛ ¼ ⅓ ½ ⅔ ¾) are used for US units,
 * and decimals for metric ones.
 */

export type Dimension = "volume" | "mass" | "count";
export type System = "us" | "metric";

export interface Unit {
  id: string;               // "tbsp"
  dimension: Dimension;
  factor: number;           // in ml or g; 1 for count units
  system: System | "any";
  singular: string;         // as written: "tablespoon" or "tbsp"
  plural: string;
}

const U = (id: string, dimension: Dimension, factor: number, system: System | "any", singular: string, plural = singular): Unit =>
  ({ id, dimension, factor, system, singular, plural });

export const UNITS: Record<string, Unit> = Object.fromEntries([
  U("tsp", "volume", 4.92892, "us", "tsp"), U("tbsp", "volume", 14.7868, "us", "tbsp"),
  U("cup", "volume", 236.588, "us", "cup", "cups"), U("floz", "volume", 29.5735, "us", "fl oz"),
  U("pint", "volume", 473.176, "us", "pint", "pints"), U("quart", "volume", 946.353, "us", "quart", "quarts"),
  U("gallon", "volume", 3785.41, "us", "gallon", "gallons"),
  U("ml", "volume", 1, "metric", "ml"), U("l", "volume", 1000, "metric", "l"),
  U("g", "mass", 1, "metric", "g"), U("kg", "mass", 1000, "metric", "kg"),
  U("oz", "mass", 28.3495, "us", "oz"), U("lb", "mass", 453.592, "us", "lb"),
  ...["pinch", "dash", "clove", "can", "tin", "jar", "slice", "piece", "bunch", "handful", "sprig", "stick", "packet",
      "sachet", "head", "stalk", "fillet", "sheet", "cube", "drop", "leaf", "knob", "rasher", "bag", "bottle", "box"]
    .map((n) => U(n, "count", 1, "any", n, n === "pinch" ? "pinches" : n === "dash" ? "dashes" : n === "box" ? "boxes" :
                                         n === "bunch" ? "bunches" : n === "leaf" ? "leaves" : n + "s")),
].map((u) => [u.id, u]));

/** Spellings people use, lower-cased (except T/t, which are checked before lower-casing). */
const ALIASES: Record<string, string> = {
  teaspoon: "tsp", teaspoons: "tsp", tsps: "tsp", "tsp.": "tsp", ts: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp", "tbsp.": "tbsp", tbs: "tbsp", tbl: "tbsp", tbls: "tbsp",
  cups: "cup", c: "cup", "fl oz": "floz", "fl. oz": "floz", "fl.oz": "floz", "fluid ounce": "floz", "fluid ounces": "floz",
  pints: "pint", pt: "pint", quarts: "quart", qt: "quart", gallons: "gallon", gal: "gallon",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", mls: "ml", ltr: "l", liter: "l", liters: "l",
  litre: "l", litres: "l", gram: "g", grams: "g", gr: "g", grs: "g", gm: "g", gms: "g", kilogram: "kg", kilograms: "kg",
  kgs: "kg", kilo: "kg", kilos: "kg", ounce: "oz", ounces: "oz", "oz.": "oz", pound: "lb", pounds: "lb", lbs: "lb", "lb.": "lb",
  leaves: "leaf", pinches: "pinch", dashes: "dash", bunches: "bunch", boxes: "box",
};

/** The unit a word names, or undefined. "T" is a tablespoon and "t" a teaspoon, as in many older recipes. */
export function findUnit(word: string): Unit | undefined {
  if (word === "T" || word === "Tb") return UNITS.tbsp;
  if (word === "t") return UNITS.tsp;
  const w = word.toLowerCase().replace(/\.$/, "");
  const id = ALIASES[w] ?? ALIASES[w + "."] ?? (UNITS[w] ? w : w.endsWith("s") && UNITS[w.slice(0, -1)] ? w.slice(0, -1) : undefined);
  return id ? UNITS[id] : undefined;
}

// -- numbers ---------------------------------------------------------------------------------------------

const VULGAR: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅕": 1 / 5, "⅖": 2 / 5,
  "⅗": 3 / 5, "⅘": 4 / 5, "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, quarter: 0.25, dozen: 12, couple: 2 };

/** A number at the start of ``text``: "1 1/2", "1½", "1.5", "½", "3/4", "one", "a dozen". Returns it and what was read. */
export function readNumber(text: string): { value: number; length: number } | undefined {
  const t = text.replace(/⁄/g, "/");
  let m = /^(\d+)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/.exec(t);                       // 1½
  if (m) return { value: Number(m[1]) + VULGAR[m[2]!]!, length: m[0].length };
  m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(t);                                  // 1 1/2
  if (m && Number(m[3]) > 0) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), length: m[0].length };
  m = /^(\d+)\s*\/\s*(\d+)/.exec(t);                                           // 3/4
  if (m && Number(m[2]) > 0) return { value: Number(m[1]) / Number(m[2]), length: m[0].length };
  m = /^(\d+(?:[.,]\d+)?|\.\d+)/.exec(t);                                      // 1.5, 1,5, .5
  if (m) return { value: Number(m[1]!.replace(",", ".")), length: m[0].length };
  m = /^([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/.exec(t);
  if (m) return { value: VULGAR[m[1]!]!, length: 1 };
  m = /^(a\s+dozen|a\s+couple(?:\s+of)?|a\s+half|half\s+an?|a\s+quarter(?:\s+of)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|dozen|couple)\b/i.exec(t);
  if (m) {
    const phrase = m[1]!.toLowerCase().replace(/\s+/g, " ");
    const value = phrase.startsWith("a dozen") ? 12 : phrase.startsWith("a couple") ? 2 : phrase === "a half" || phrase.startsWith("half ") ? 0.5
      : phrase.startsWith("a quarter") ? 0.25 : WORDS[phrase]!;
    return { value, length: m[0].length };
  }
  return undefined;
}

// -- amounts ---------------------------------------------------------------------------------------------

export interface Amount {
  value: number;
  max?: number;             // a range: 2-3
  unit?: Unit;              // none: a plain count ("3 eggs")
}

export function scale(amount: Amount, factor: number): Amount {
  const out: Amount = { value: amount.value * factor };
  if (amount.max !== undefined) out.max = amount.max * factor;
  if (amount.unit) out.unit = amount.unit;
  return out;
}

/** Can two amounts be added? Same dimension, and for count units the same unit (cloves + cloves, not cloves + cans). */
export function compatible(a: Amount, b: Amount): boolean {
  if (!a.unit || !b.unit) return !a.unit && !b.unit;
  if (a.unit.dimension !== b.unit.dimension) return false;
  return a.unit.dimension !== "count" || a.unit.id === b.unit.id;
}

/** a + b in a's unit (ranges add their ends). Undefined if they can't be added. */
export function add(a: Amount, b: Amount): Amount | undefined {
  if (!compatible(a, b)) return undefined;
  const k = a.unit && b.unit ? b.unit.factor / a.unit.factor : 1;
  const out: Amount = { value: a.value + b.value * k };
  if (a.max !== undefined || b.max !== undefined) out.max = (a.max ?? a.value) + (b.max ?? b.value) * k;
  if (a.unit) out.unit = a.unit;
  return out;
}

// -- writing -------------------------------------------------------------------------------------------------

const FRACTIONS: [number, string][] = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"],
  [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];

/** 1.5 -> "1 ½", 0.333 -> "⅓", 2.97 -> "3". Uses the nearest eighth or third. */
export function fraction(n: number): string {
  if (n <= 0) return "0";
  let whole = Math.floor(n);
  const rest = n - whole;
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f;
  if (best[0] === 1) whole += 1;
  if (whole === 0 && best[1] === "") return n < 1 / 16 ? "a little" : "⅛";
  return whole === 0 ? best[1] : best[1] ? `${whole} ${best[1]}` : String(whole);
}

/** Decimal with sensible precision: 1250 -> "1250", 1.25 -> "1.25", 0.333 -> "0.33", 12.04 -> "12". */
export function decimal(n: number): string {
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return String(Number(n.toFixed(digits)));
}

/** Metric weights and volumes rounded the way a kitchen scale or jug would be read. */
function roundMetric(n: number): number {
  if (n >= 500) return Math.round(n / 25) * 25;
  if (n >= 100) return Math.round(n / 5) * 5;
  if (n >= 10) return Math.round(n);
  return Math.round(n * 10) / 10;
}

const US_VOLUME = ["tsp", "tbsp", "cup"] as const;

/**
 * Picks the unit that reads best in the amount's own system: teaspoons up to 3,
 * tablespoons below ¼ cup, then cups; grams below 1 kg; ml below 1 l; ounces below 1 lb.
 * Fluid ounces, pints and the like are left as they were written.
 */
export function tidy(amount: Amount): Amount {
  const unit = amount.unit;
  if (!unit || unit.dimension === "count") return amount;
  const base = amount.value * unit.factor;
  const baseMax = amount.max !== undefined ? amount.max * unit.factor : undefined;
  let target: Unit = unit;
  if (US_VOLUME.includes(unit.id as (typeof US_VOLUME)[number])) {
    target = base < UNITS.tbsp!.factor * 0.99 ? UNITS.tsp! : base < UNITS.cup!.factor / 4 * 0.99 ? UNITS.tbsp! : UNITS.cup!;
  } else if (unit.id === "g" || unit.id === "kg") {
    target = base >= 1000 ? UNITS.kg! : UNITS.g!;
  } else if (unit.id === "ml" || unit.id === "l") {
    target = base >= 1000 ? UNITS.l! : UNITS.ml!;
  } else if (unit.id === "oz" || unit.id === "lb") {
    target = base >= UNITS.lb!.factor ? UNITS.lb! : UNITS.oz!;
  }
  const out: Amount = { value: base / target.factor, unit: target };
  if (baseMax !== undefined) out.max = baseMax / target.factor;
  if (target.system === "metric" && target.id !== "kg" && target.id !== "l") {
    out.value = roundMetric(out.value);
    if (out.max !== undefined) out.max = roundMetric(out.max);
  }
  return out;
}

function numberText(n: number, unit: Unit | undefined): string {
  if (unit?.system === "metric") return decimal(n);
  return fraction(n);
}

/** "1 ½ cups", "250 g", "2–3 cloves", "3". */
export function format(amount: Amount): string {
  const unit = amount.unit;
  const value = numberText(amount.value, unit);
  const max = amount.max !== undefined ? numberText(amount.max, unit) : undefined;
  const number = max && max !== value ? `${value}–${max}` : value;
  if (!unit) return number;
  const top = amount.max ?? amount.value;
  const plural = top > 1 && !(unit.system === "us" && fraction(top) === "1");
  return `${number} ${plural ? unit.plural : unit.singular}`;
}

/** Converts to the other system ("metric" or "us") for people who think in grams, or in cups. */
export function convert(amount: Amount, system: System): Amount {
  const unit = amount.unit;
  if (!unit || unit.dimension === "count" || unit.system === system) return amount;
  const base = amount.value * unit.factor;
  const baseMax = amount.max !== undefined ? amount.max * unit.factor : undefined;
  const target = unit.dimension === "volume" ? (system === "metric" ? UNITS.ml! : UNITS.cup!) : (system === "metric" ? UNITS.g! : UNITS.oz!);
  const out: Amount = { value: base / target.factor, unit: target };
  if (baseMax !== undefined) out.max = baseMax / target.factor;
  return tidy(out);
}
