/* ============================================================
   Nutrient model
   ============================================================ */

const NUTRIENT_GROUPS = {
  macro: ["cal", "protein", "carbs", "fat", "omega3", "fiber", "sugar"],
  vitamins: ["vitA", "vitC", "vitD", "vitE", "vitK", "vitK2", "b1", "b2", "b3", "b6", "b9", "b12"],
  minerals: ["calcium", "iron", "magnesium", "phosphorus", "potassium", "sodium", "zinc"]
};

const ALL_NUTRIENTS = [
  ...NUTRIENT_GROUPS.macro,
  ...NUTRIENT_GROUPS.vitamins,
  ...NUTRIENT_GROUPS.minerals
];

const NUTRIENT_META = {
  cal: { label: "Calories", unit: "kcal" },
  protein: { label: "Protein", unit: "g" },
  carbs: { label: "Carbs", unit: "g" },
  fat: { label: "Fat", unit: "g" },
  omega3: { label: "Omega-3", unit: "g" },
  fiber: { label: "Fiber", unit: "g" },
  sugar: { label: "Sugar", unit: "g" },
  vitA: { label: "Vitamin A", unit: "mcg" },
  vitC: { label: "Vitamin C", unit: "mg" },
  vitD: { label: "Vitamin D", unit: "mcg" },
  vitE: { label: "Vitamin E", unit: "mg" },
  vitK: { label: "Vitamin K1", unit: "mcg" },
  vitK2: { label: "Vitamin K2", unit: "mcg" },
  b1: { label: "Thiamin (B1)", unit: "mg" },
  b2: { label: "Riboflavin (B2)", unit: "mg" },
  b3: { label: "Niacin (B3)", unit: "mg" },
  b6: { label: "Vitamin B6", unit: "mg" },
  b9: { label: "Folate (B9)", unit: "mcg" },
  b12: { label: "Vitamin B12", unit: "mcg" },
  calcium: { label: "Calcium", unit: "mg" },
  iron: { label: "Iron", unit: "mg" },
  magnesium: { label: "Magnesium", unit: "mg" },
  phosphorus: { label: "Phosphorus", unit: "mg" },
  potassium: { label: "Potassium", unit: "mg" },
  sodium: { label: "Sodium", unit: "mg" },
  zinc: { label: "Zinc", unit: "mg" }
};

// Standard adult daily reference values -- editable per user in Settings.
const DEFAULT_TARGETS = {
  cal: 2200, protein: 130, carbs: 300, fat: 70, omega3: 1.6, fiber: 30, sugar: 50,
  vitA: 900, vitC: 90, vitD: 15, vitE: 15, vitK: 120, vitK2: 100,
  b1: 1.2, b2: 1.3, b3: 16, b6: 1.7, b9: 400, b12: 2.4,
  calcium: 1000, iron: 18, magnesium: 400, phosphorus: 700, potassium: 3400, sodium: 2300, zinc: 11
};

function emptyNutrients() {
  let o = {};
  ALL_NUTRIENTS.forEach(n => o[n] = 0);
  return o;
}

/* ============================================================
   Body tracking -- optional measurements beyond weight/body-fat
   ============================================================ */

const BODY_METRICS = [
  { id: "waist", label: "Waist", unit: "cm" },
  { id: "chest", label: "Chest", unit: "cm" },
  { id: "hips", label: "Hips", unit: "cm" },
  { id: "shoulders", label: "Shoulders", unit: "cm" },
  { id: "neck", label: "Neck", unit: "cm" },
  { id: "arms", label: "Arms", unit: "cm" },
  { id: "thighs", label: "Thighs", unit: "cm" },
  { id: "calves", label: "Calves", unit: "cm" }
];

/* ============================================================
   Food library -- per-100g values, editable, with serving presets.
   Sourced from USDA FoodData Central / ICMR-NIN Indian Food
   Composition Tables where relevant. Treat as good approximations,
   not lab-verified figures -- edit freely for your own brands.
   ============================================================ */

const DEFAULT_FOODS = [
  {
    name: "Egg, boiled",
    category: "Protein",
    per100g: Object.assign(emptyNutrients(), {
      cal: 155, protein: 12.6, carbs: 1.1, fat: 10.6, omega3: 0.07, fiber: 0, sugar: 0.6,
      vitA: 149, vitD: 2.2, vitE: 1.0, vitK: 0.3,
      b1: 0.066, b2: 0.513, b3: 0.064, b6: 0.121, b9: 44, b12: 1.11,
      calcium: 50, iron: 1.2, magnesium: 10, phosphorus: 172, potassium: 126, sodium: 124, zinc: 1.0
    }),
    presets: [
      { label: "1 large egg (~50g)", grams: 50 },
      { label: "1 medium egg (~44g)", grams: 44 },
      { label: "100g", grams: 100 }
    ]
  },
  {
    name: "Avocado, raw",
    category: "Fruit",
    per100g: Object.assign(emptyNutrients(), {
      cal: 160, protein: 2.0, carbs: 8.5, fat: 14.7, omega3: 0.11, fiber: 6.7, sugar: 0.7,
      vitA: 7, vitC: 10, vitE: 2.1, vitK: 21,
      b1: 0.067, b2: 0.13, b3: 1.74, b6: 0.26, b9: 81,
      calcium: 12, iron: 0.55, magnesium: 29, phosphorus: 52, potassium: 485, sodium: 7, zinc: 0.64
    }),
    presets: [
      { label: "Half avocado (~100g)", grams: 100 },
      { label: "Whole avocado (~200g)", grams: 200 },
      { label: "100g", grams: 100 }
    ]
  },
  {
    name: "Rajma (kidney beans), cooked",
    category: "Legume",
    per100g: Object.assign(emptyNutrients(), {
      cal: 127, protein: 8.7, carbs: 22.8, fat: 0.5, fiber: 6.4, sugar: 0.3,
      vitC: 1.2, vitE: 0.87, vitK: 8.4,
      b1: 0.16, b2: 0.06, b3: 0.58, b6: 0.12, b9: 130,
      calcium: 28, iron: 2.9, magnesium: 45, phosphorus: 142, potassium: 403, sodium: 2, zinc: 1.07
    }),
    presets: [
      { label: "1 katori cooked (~150g)", grams: 150 },
      { label: "1 cup cooked (~177g)", grams: 177 },
      { label: "100g", grams: 100 }
    ]
  },
  {
    name: "Curd, toned milk (dahi)",
    category: "Dairy",
    per100g: Object.assign(emptyNutrients(), {
      cal: 62, protein: 4.0, carbs: 4.4, fat: 3.1, fiber: 0, sugar: 4.4,
      vitA: 30, b12: 0.3,
      calcium: 138, potassium: 150, sodium: 45, zinc: 0.4
    }),
    presets: [
      { label: "1 katori (~150g)", grams: 150 },
      { label: "1 cup (~200g)", grams: 200 },
      { label: "100g", grams: 100 }
    ]
  },
  {
    name: "Paneer, low fat (skimmed milk)",
    category: "Dairy",
    per100g: Object.assign(emptyNutrients(), {
      cal: 105, protein: 16, carbs: 3, fat: 3, fiber: 0, sugar: 3,
      calcium: 250, phosphorus: 200, sodium: 20, zinc: 1.5
    }),
    presets: [
      { label: "1 serving cube (~50g)", grams: 50 },
      { label: "100g", grams: 100 }
    ]
  },
  {
    name: "Milk, skimmed",
    category: "Dairy",
    per100g: Object.assign(emptyNutrients(), {
      cal: 35, protein: 3.1, carbs: 5.0, fat: 0.1, fiber: 0, sugar: 5.0,
      vitA: 75, vitD: 0.5, b12: 0.4,
      calcium: 150, potassium: 170, sodium: 45
    }),
    presets: [
      { label: "1 glass (~200ml)", grams: 200 },
      { label: "1 cup (~244ml)", grams: 244 },
      { label: "100ml", grams: 100 }
    ]
  },
  {
    name: "Guava",
    category: "Fruit",
    per100g: Object.assign(emptyNutrients(), {
      cal: 68, protein: 2.55, carbs: 14.32, fat: 0.95, fiber: 5.4, sugar: 8.92,
      vitA: 31, vitC: 228.3, vitK: 2.2,
      b1: 0.067, b2: 0.04, b3: 1.084, b6: 0.11, b9: 49,
      calcium: 18, iron: 0.26, magnesium: 22, phosphorus: 40, potassium: 417, sodium: 2, zinc: 0.23
    }),
    presets: [
      { label: "1 medium guava (~100g)", grams: 100 },
      { label: "Half guava (~50g)", grams: 50 }
    ]
  }
];

const DEFAULT_TEMPLATES = [
  {
    name: "Oats Shake",
    category: "Breakfast",
    photo: null,
    foodItems: [],
    ingredients: ["40g oats", "300ml milk", "1 scoop whey"],
    nutrients: Object.assign(emptyNutrients(), { cal: 472, protein: 44, carbs: 39, fat: 15, fiber: 4, calcium: 320, sodium: 180, potassium: 520 })
  },
  {
    name: "Rice Eggs Meal",
    category: "Lunch",
    photo: null,
    foodItems: [],
    ingredients: ["100g rice", "4 eggs"],
    nutrients: Object.assign(emptyNutrients(), { cal: 640, protein: 31, carbs: 80, fat: 20, fiber: 1, calcium: 60, iron: 2.5 })
  }
];

/* ============================================================
   AI extraction helper -- generates a copy-paste prompt so any
   chat AI returns nutrition data in a format this tool can import.
   ============================================================ */

function buildAiFoodPrompt(foodName) {
  let name = (foodName || "the food").trim();
  return `Give me the complete nutrition profile of "${name}" per 100 grams (or per 100ml if it is a liquid).

Return ONLY a single valid JSON object in plain pastable text, no other text before or after it, no markdown fences, using exactly this schema and these units:

{
  "name": "${name}",
  "category": "Protein | Dairy | Fruit | Vegetable | Grain | Legume | Fat | Other",
  "per100g": {
    "cal": kcal, "protein": g, "carbs": g, "fat": g, "omega3": g, "fiber": g, "sugar": g,
    "vitA": mcg_RAE, "vitC": mg, "vitD": mcg, "vitE": mg, "vitK": mcg_K1, "vitK2": mcg_K2,
    "b1": mg, "b2": mg, "b3": mg, "b6": mg, "b9": mcg_folate, "b12": mcg,
    "calcium": mg, "iron": mg, "magnesium": mg, "phosphorus": mg, "potassium": mg, "sodium": mg, "zinc": mg
  },
  "presets": [
    { "label": "a common serving description with its weight in grams", "grams": number },
    { "label": "a second common serving size", "grams": number }
  ]
}

Use 0 for any nutrient with no significant amount -- never omit a key. omega3 should be total EPA+DHA+ALA in grams. vitK2 is menaquinone (MK-4/MK-7) in micrograms, separate from vitK (phylloquinone/K1). Base the numbers on USDA FoodData Central or, for Indian foods, ICMR-NIN Indian Food Composition Tables. Return nothing except that JSON object.`;
}

// Extracts the first {...} block from pasted text and parses it as a food record.
function parseAiFoodJson(text) {
  let match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in the pasted text.");
  let obj = JSON.parse(match[0]);
  if (!obj.per100g) throw new Error("JSON is missing a per100g field.");
  let per100g = Object.assign(emptyNutrients(), obj.per100g);
  ALL_NUTRIENTS.forEach(n => per100g[n] = Number(per100g[n]) || 0);
  return {
    name: obj.name || "Imported food",
    category: obj.category || "Other",
    per100g,
    presets: Array.isArray(obj.presets) && obj.presets.length
      ? obj.presets.map(p => ({ label: String(p.label || "Serving"), grams: Number(p.grams) || 100 }))
      : [{ label: "100g", grams: 100 }]
  };
}
