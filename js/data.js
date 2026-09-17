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
   Starts empty; add your own foods in the Foods tab (manually or
   via the AI-assisted import) so suggestions reflect your own diet.
   ============================================================ */

const DEFAULT_FOODS = [];

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
