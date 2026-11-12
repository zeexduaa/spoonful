# Roadmap

spoonful already covers the everyday loop: keep recipes, paste them in, scale them, cook from
them, plan the week, and shop from a list that adds itself up. This is what's next, roughly in
order. Ideas and help are welcome.

## Next

- [ ] **Photos** for recipes, stored in the browser (IndexedDB), with a camera button on phones.
- [ ] **Import from a link.** Paste a recipe's address and spoonful fetches it. This needs a
      small optional proxy, because browsers block reading other sites directly.
- [ ] **Sync between devices**, end-to-end encrypted, so the recipe box on your phone and your
      laptop stay the same. The backup format already merges by last edit.
- [ ] **Pantry.** Mark what you have at home, and the shopping list subtracts it.
- [ ] **Timers in cook mode**, started from the times in a step ("simmer 15 minutes").
- [ ] **Nutrition estimates** per serving from an open food database, clearly labelled as
      estimates.
- [ ] **More languages** for ingredients and units, starting with Urdu and Spanish.

## Later

- [ ] Shared shopping lists for a household (ticks show up on everyone's phone).
- [ ] Leftovers. Planning a recipe for 6 when 2 are eating fills the next day's lunch.
- [ ] A cost estimate for the week, from prices you enter.
- [ ] Printable recipe cards and a cookbook PDF.
- [ ] An accessibility review with screen reader users.

## Done

- [x] Amounts: fractions, ranges, words, units (T versus t), scaling, adding, US/metric.
- [x] Ingredient lines, shopping keys and aisles.
- [x] Recipes with paste-import (text and schema.org data), search and tags.
- [x] Week planner, and a shopping list that adds up, rounds up and groups by aisle.
- [x] A web app with cook mode, offline support, installing, backups, dark mode and a phone
      layout.
