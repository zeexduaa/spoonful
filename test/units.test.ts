import { test } from "node:test";
import assert from "node:assert/strict";
import * as u from "../src/core/units.js";

const amt = (value: number, unit?: string, max?: number): u.Amount => {
  const a: u.Amount = { value };
  if (unit) a.unit = u.UNITS[unit]!;
  if (max !== undefined) a.max = max;
  return a;
};

test("reads numbers however recipes write them", () => {
  const read = (t: string) => u.readNumber(t)?.value;
  assert.equal(read("1 1/2 cups"), 1.5);
  assert.equal(read("1½ cups"), 1.5);
  assert.equal(read("1 ½"), 1.5);
  assert.equal(read("3/4"), 0.75);
  assert.equal(read("1⁄3"), 1 / 3);
  assert.equal(read("½"), 0.5);
  assert.equal(read("2.5"), 2.5);
  assert.equal(read("2,5"), 2.5);
  assert.equal(read(".5"), 0.5);
  assert.equal(read("a dozen eggs"), 12);
  assert.equal(read("an onion"), 1);
  assert.equal(read("two cloves"), 2);
  assert.equal(read("half a lemon"), 0.5);
  assert.equal(read("salt"), undefined);
  assert.equal(read("1/0"), 1);                  // never divides by zero
});

test("finds units, including T versus t", () => {
  assert.equal(u.findUnit("Tablespoons")?.id, "tbsp");
  assert.equal(u.findUnit("T")?.id, "tbsp");
  assert.equal(u.findUnit("t")?.id, "tsp");
  assert.equal(u.findUnit("tsp.")?.id, "tsp");
  assert.equal(u.findUnit("grams")?.id, "g");
  assert.equal(u.findUnit("lbs")?.id, "lb");
  assert.equal(u.findUnit("cloves")?.id, "clove");
  assert.equal(u.findUnit("leaves")?.id, "leaf");
  assert.equal(u.findUnit("flour"), undefined);
});

test("kitchen fractions and decimals", () => {
  assert.deepEqual([1.5, 0.333, 0.25, 2.97, 0.125, 1.66, 0.01].map(u.fraction), ["1 ½", "⅓", "¼", "3", "⅛", "1 ⅔", "a little"]);
  assert.deepEqual([1250, 1.25, 0.3333, 12.04].map(u.decimal), ["1250", "1.25", "0.33", "12"]);
});

test("amounts read best after scaling", () => {
  const show = (a: u.Amount) => u.format(u.tidy(a));
  assert.equal(show(u.scale(amt(0.75, "cup"), 2)), "1 ½ cups");
  assert.equal(show(u.scale(amt(1, "tsp"), 3)), "1 tbsp");
  assert.equal(show(u.scale(amt(2, "tbsp"), 2)), "¼ cup");
  assert.equal(show(u.scale(amt(1, "cup"), 1 / 8)), "2 tbsp");
  assert.equal(show(u.scale(amt(500, "g"), 2.5)), "1.25 kg");
  assert.equal(show(u.scale(amt(150, "g"), 1 / 3)), "50 g");
  assert.equal(show(u.scale(amt(333, "ml"), 1)), "335 ml");
  assert.equal(show(u.scale(amt(12, "oz"), 2)), "1 ½ lb");
  assert.equal(show(u.scale(amt(2, "clove", 3), 2)), "4–6 cloves");
  assert.equal(show(u.scale(amt(3), 0.5)), "1 ½");
  assert.equal(show(amt(1, "cup")), "1 cup");
  assert.equal(show(amt(1, "pinch")), "1 pinch");
});

test("adding amounts across units, but never across dimensions", () => {
  const sum = u.add(amt(2, "cup"), amt(250, "ml"))!;
  assert.equal(u.format(u.tidy(sum)), "3 cups");
  assert.equal(u.format(u.tidy(u.add(amt(1, "kg"), amt(500, "g"))!)), "1.5 kg");
  assert.equal(u.add(amt(1, "cup"), amt(100, "g")), undefined);
  assert.equal(u.add(amt(2, "clove"), amt(1, "can")), undefined);
  assert.equal(u.format(u.add(amt(2), amt(3))!), "5");
  assert.equal(u.format(u.tidy(u.add(amt(1, "clove", 2), amt(1, "clove"))!)), "2–3 cloves");
});

test("converting between US and metric", () => {
  assert.equal(u.format(u.convert(amt(1, "cup"), "metric")), "235 ml");
  assert.equal(u.format(u.convert(amt(1, "lb"), "metric")), "455 g");
  assert.equal(u.format(u.convert(amt(250, "ml"), "us")), "1 cup");
  assert.equal(u.format(u.convert(amt(100, "g"), "us")), "3 ½ oz");
  assert.equal(u.format(u.convert(amt(2, "clove"), "metric")), "2 cloves");
});
