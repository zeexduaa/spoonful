/** A few recipes to try spoonful with, written for it. */

import type { RecipeInput } from "../core/recipes.js";

export const SAMPLES: RecipeInput[] = [
  {
    title: "Weeknight chickpea curry",
    servings: 4, prepMinutes: 10, cookMinutes: 25, tags: ["dinner", "vegetarian", "quick"],
    ingredients: [
      "2 tbsp vegetable oil", "1 large onion, finely chopped", "3 cloves garlic, minced", "1 tbsp grated ginger",
      "2 tbsp curry powder", "2 (400 g) cans chickpeas, drained", "1 (400 ml) can coconut milk", "200 g spinach",
      "1 lime", "Salt, to taste", "Coriander, to serve",
    ],
    steps: [
      "Heat the oil in a wide pan over a medium heat and cook the onion with a pinch of salt for 8 minutes, until soft and golden.",
      "Add the garlic, ginger and curry powder and stir for a minute, until it smells toasty.",
      "Tip in the chickpeas and coconut milk, bring to a gentle simmer and cook for 10 minutes.",
      "Stir in the spinach until it wilts. Squeeze in the lime juice and season with salt.",
      "Serve with rice or warm flatbreads, scattered with coriander.",
    ],
    notes: "Keeps for 3 days in the fridge and tastes even better the next day.",
  },
  {
    title: "Overnight oats",
    servings: 1, prepMinutes: 5, tags: ["breakfast", "make ahead"],
    ingredients: ["½ cup rolled oats", "½ cup milk", "¼ cup plain yogurt", "1 tsp honey", "½ banana, sliced", "1 handful berries"],
    steps: [
      "Stir the oats, milk, yogurt and honey together in a jar.",
      "Cover and leave in the fridge overnight.",
      "In the morning, top with the banana and berries.",
    ],
  },
  {
    title: "Lemon garlic pasta",
    servings: 2, prepMinutes: 5, cookMinutes: 12, tags: ["dinner", "quick"],
    ingredients: [
      "200 g spaghetti", "3 tbsp olive oil", "3 garlic cloves, thinly sliced", "1 lemon, zested and juiced",
      "40 g parmesan, finely grated", "1 handful parsley, chopped", "Black pepper, to taste", "Chilli flakes (optional)",
    ],
    steps: [
      "Cook the spaghetti in plenty of salted boiling water until just tender. Keep a mugful of the cooking water.",
      "Meanwhile, warm the oil and garlic in a large pan over a low heat until the garlic is pale gold.",
      "Add the drained pasta, lemon zest and juice, parmesan and a splash of the cooking water, and toss until glossy.",
      "Finish with parsley, black pepper and chilli flakes if you like.",
    ],
  },
  {
    title: "Tray-baked chicken and vegetables",
    servings: 4, prepMinutes: 15, cookMinutes: 45, tags: ["dinner", "one tray"],
    ingredients: [
      "8 chicken thighs", "600 g potatoes, cut into chunks", "2 red bell peppers, cut into strips", "1 red onion, cut into wedges",
      "3 tbsp olive oil", "2 tsp smoked paprika", "4 garlic cloves, unpeeled", "1 tsp dried oregano", "Salt and pepper, to taste",
    ],
    steps: [
      "Heat the oven to 200°C (400°F).",
      "Toss everything in a large roasting tray with the oil, paprika, oregano, salt and pepper, chicken skin-side up.",
      "Roast for 40 to 45 minutes, turning the vegetables once, until the chicken is cooked through and the potatoes are crisp.",
    ],
  },
];
