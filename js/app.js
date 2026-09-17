/* ============================================================
   State + storage
   ============================================================ */

function load(key, fallback) {
  try {
    let v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

let templates = load("dt_templates", DEFAULT_TEMPLATES);
let foods = load("dt_foods", DEFAULT_FOODS);
let addedNewDefaultFoods = false;
DEFAULT_FOODS.forEach(f => {
  if (!foods.some(x => x.name === f.name)) { foods.push(JSON.parse(JSON.stringify(f))); addedNewDefaultFoods = true; }
});
let today = load("dt_today", { date: todayStr(), entries: [] });
let history = load("dt_history", []);
let bodyLog = load("dt_bodyLog", []);
let bodyPhotos = load("dt_bodyPhotos", []);
let bodyPhotosUnlocked = false;
let bodyCompareSelection = [];
let water = load("dt_water", {});
let settings = Object.assign({ targets: Object.assign({}, DEFAULT_TARGETS), proteinMode: "manual", proteinPerKgLBM: 2, waterTarget: 8, theme: "clinical", bodyPin: "" }, load("dt_settings", {}));
if (!settings.targets) settings.targets = Object.assign({}, DEFAULT_TARGETS);
ALL_NUTRIENTS.forEach(n => { if (settings.targets[n] === undefined) settings.targets[n] = DEFAULT_TARGETS[n]; });

let mealSearch = "";
let mealFilter = "All";
let foodSearch = "";
let showMicros = false;

const CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snack"];
const THEMES = [
  { id: "night", label: "Night Shift", dots: ["#0b1220", "#3ddc97", "#5b9bf7"] },
  { id: "clinical", label: "Clinical", dots: ["#f4f7f9", "#0f6d5d", "#2455c9"] },
  { id: "ledger", label: "Ledger", dots: ["#efeae0", "#8b3a3a", "#1b2430"] },
  { id: "terminal", label: "Terminal", dots: ["#04100a", "#39ff88", "#7ad9ff"] }
];

if (today.date !== todayStr()) {
  if (today.entries.length) finalizeDay(today.date, today.entries);
  today = { date: todayStr(), entries: [] };
}

if (addedNewDefaultFoods) save();

function save() {
  localStorage.setItem("dt_templates", JSON.stringify(templates));
  localStorage.setItem("dt_foods", JSON.stringify(foods));
  localStorage.setItem("dt_today", JSON.stringify(today));
  localStorage.setItem("dt_history", JSON.stringify(history));
  localStorage.setItem("dt_bodyLog", JSON.stringify(bodyLog));
  localStorage.setItem("dt_bodyPhotos", JSON.stringify(bodyPhotos));
  localStorage.setItem("dt_water", JSON.stringify(water));
  localStorage.setItem("dt_settings", JSON.stringify(settings));
}

function finalizeDay(date, entries) {
  let t = sumEntries(entries);
  let existing = history.find(h => h.date === date);
  let latestBody = bodyLog.length ? bodyLog[bodyLog.length - 1] : null;
  let record = { date, totals: t, weight: latestBody ? latestBody.weight : null, bf: latestBody ? latestBody.bf : null };
  if (existing) Object.assign(existing, record);
  else history.push(record);
  history.sort((a, b) => a.date.localeCompare(b.date));
}

/* ============================================================
   Theme
   ============================================================ */

function applyTheme() {
  document.body.dataset.theme = settings.theme || "clinical";
}

function setTheme(id) {
  settings.theme = id;
  save();
  applyTheme();
  renderSettings();
}

/* ============================================================
   Tabs
   ============================================================ */

const TABS = ["meals", "foods", "nutrition", "body", "water", "trends", "settings"];

function tab(t) {
  TABS.forEach(x => { document.getElementById(x).style.display = (x === t) ? "block" : "none"; });
  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  ({ meals: renderMeals, foods: renderFoods, nutrition: renderNutrition, body: renderBody, water: renderWater, trends: renderTrends, settings: renderSettings })[t]();
}

function closeOverlay() { document.getElementById("overlayRoot").innerHTML = ""; }

/* ============================================================
   Nutrient helpers
   ============================================================ */

function scaleNutrients(m, factor) {
  let out = {};
  ALL_NUTRIENTS.forEach(n => out[n] = round1((m[n] || 0) * factor));
  return out;
}

function round1(n) { return Math.round(n * 10) / 10; }

function sumEntries(entries) {
  let t = emptyNutrients();
  entries.forEach(e => ALL_NUTRIENTS.forEach(n => t[n] += (e.nutrients[n] || 0)));
  return t;
}

function lbmProteinTarget() {
  let latest = bodyLog.length ? bodyLog[bodyLog.length - 1] : null;
  if (!latest) return settings.targets.protein;
  let lbm = latest.weight * (1 - (latest.bf || 0) / 100);
  return round1(lbm * settings.proteinPerKgLBM);
}

function targetFor(n) {
  return n === "protein" && settings.proteinMode === "lbm" ? lbmProteinTarget() : settings.targets[n];
}

function currentStreak() {
  let dates = new Set(history.filter(h => h.totals.cal > 0).map(h => h.date));
  if (today.entries.length) dates.add(today.date);
  let streak = 0, d = new Date();
  while (true) {
    let ds = d.toISOString().slice(0, 10);
    if (dates.has(ds)) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* ============================================================
   Photo capture — resized + compressed to keep localStorage small
   ============================================================ */

function readAndResizeImage(file, maxDim, cb) {
  let reader = new FileReader();
  reader.onload = function (e) {
    let img = new Image();
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      let canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   MEALS TAB
   ============================================================ */

function renderMeals() {
  let filtered = templates
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => mealFilter === "All" || m.category === mealFilter)
    .filter(({ m }) => !mealSearch || m.name.toLowerCase().includes(mealSearch.toLowerCase()))
    .sort((a, b) => (b.m.pinned ? 1 : 0) - (a.m.pinned ? 1 : 0));

  let html = `<h2 class="page-title">Meals</h2>`;
  html += `<div class="search-wrap"><input placeholder="Search meal templates..." value="${escapeAttr(mealSearch)}" oninput="mealSearch=this.value;renderMeals()"></div>`;
  html += `<div class="chip-row">`;
  ["All", ...CATEGORIES].forEach(c => html += `<div class="chip ${mealFilter === c ? 'active' : ''}" onclick="mealFilter='${c}';renderMeals()">${c}</div>`);
  html += `</div>`;

  if (!filtered.length) html += `<div class="card"><div class="empty">No meal templates match. Create one with the + button.</div></div>`;

  filtered.forEach(({ m, i }) => {
    html += `<div class="card">
      <div class="meal-head">
        ${m.photo ? `<img class="meal-photo-sm" src="${m.photo}">` : ""}
        <div class="info">
          <div class="spread"><b>${m.pinned ? "&#128204; " : ""}${escapeHtml(m.name)}</b><span class="tag">${m.category || "Uncategorized"}</span></div>
          <div class="ingredients">${m.ingredients && m.ingredients.length ? escapeHtml(m.ingredients.join(", ")) : "No ingredients listed"}</div>
          <div class="ingredients">${round1(m.nutrients.cal)} kcal &middot; P ${round1(m.nutrients.protein)}g &middot; C ${round1(m.nutrients.carbs)}g &middot; F ${round1(m.nutrients.fat)}g</div>
        </div>
      </div>
      <div class="row">
        <button onclick="openAddServing(${i})">Add</button>
        <button class="edit small" onclick="openMealForm(${i})">Edit</button>
        <button class="secondary small" onclick="toggleMealPin(${i})">${m.pinned ? "Unpin" : "Pin"}</button>
        <button class="secondary small" onclick="duplicateMeal(${i})">Duplicate</button>
        <button class="delete small" onclick="deleteTemplate(${i})">Delete</button>
      </div>
    </div>`;
  });

  html += `<div class="card"><div class="spread"><h3>Today's Log — ${today.date}</h3><span class="streak-badge">Streak: ${currentStreak()}d</span></div>`;
  if (!today.entries.length) {
    html += `<div class="empty">Nothing logged yet today.</div>`;
  } else {
    today.entries.forEach((e, i) => {
      html += `<div class="today-item">
        ${e.photo ? `<img class="thumb" src="${e.photo}">` : ""}
        <div style="flex:1"><div>${escapeHtml(e.name)} ${e.servings && e.servings !== 1 ? `<span class="tag">${e.servings}x</span>` : ""}</div>
        <div class="meta">${e.category || ""} ${e.time ? "&middot; " + e.time : ""} &middot; ${round1(e.nutrients.cal)} kcal</div></div>
        <button class="delete small" onclick="removeEntry(${i})">&times;</button>
      </div>`;
    });
  }
  let t = sumEntries(today.entries);
  html += `<div class="ingredients" style="margin-top:10px">Today so far: ${round1(t.cal)} kcal &middot; P ${round1(t.protein)}g</div>`;
  html += `<div class="row" style="margin-top:8px">
    <button class="secondary" onclick="tab('nutrition')">View Nutrition</button>
    <button ${today.entries.length ? "" : "disabled"} onclick="closeDay()">Close Day</button>
  </div></div>`;

  document.getElementById("meals").innerHTML = html;
}

function openAddServing(i) {
  let m = templates[i];
  document.getElementById("overlayRoot").innerHTML = `
  <div class="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="sheet">
      <div class="sheet-title">Add "${escapeHtml(m.name)}"</div>
      <label>Servings / multiplier</label>
      <input id="servings" type="number" step="0.25" value="1">
      <label>Category for this log entry</label>
      <select id="cat">${CATEGORIES.map(c => `<option ${c === m.category ? "selected" : ""}>${c}</option>`).join("")}</select>
      <div class="row" style="margin-top:14px">
        <button onclick="confirmAddServing(${i})">Add to today</button>
        <button class="secondary" onclick="closeOverlay()">Cancel</button>
      </div>
    </div>
  </div>`;
}

function confirmAddServing(i) {
  let m = templates[i];
  let servings = Number(document.getElementById("servings").value) || 1;
  let category = document.getElementById("cat").value;
  today.entries.push({
    name: m.name, category, servings, photo: m.photo || null,
    time: new Date().toTimeString().slice(0, 5),
    nutrients: scaleNutrients(m.nutrients, servings)
  });
  save(); closeOverlay(); renderMeals();
}

function removeEntry(i) { today.entries.splice(i, 1); save(); renderMeals(); }

function closeDay() {
  if (!confirm("Save today's totals to history and start a fresh log?")) return;
  finalizeDay(today.date, today.entries);
  today = { date: todayStr(), entries: [] };
  save(); renderMeals();
}

function deleteTemplate(i) {
  if (confirm("Delete this meal template? This won't affect past history.")) { templates.splice(i, 1); save(); renderMeals(); }
}

function duplicateMeal(i) {
  let copy = JSON.parse(JSON.stringify(templates[i]));
  copy.name = copy.name + " Copy";
  copy.pinned = false;
  templates.push(copy); save(); renderMeals();
}

function toggleMealPin(i) { templates[i].pinned = !templates[i].pinned; save(); renderMeals(); }

function openMealForm(i) {
  let editing = i !== undefined && i !== null && i >= 0;
  let m = editing ? templates[i] : { name: "", category: "Breakfast", photo: null, foodItems: [], ingredients: [], nutrients: emptyNutrients() };

  let macroRows = NUTRIENT_GROUPS.macro.map(n => `
    <label>${NUTRIENT_META[n].label} (${NUTRIENT_META[n].unit})</label>
    <input id="f_${n}" type="number" step="0.1" value="${m.nutrients[n]}">`).join("");

  let microRows = [...NUTRIENT_GROUPS.vitamins, ...NUTRIENT_GROUPS.minerals].map(n => `
    <label>${NUTRIENT_META[n].label} (${NUTRIENT_META[n].unit})</label>
    <input id="f_${n}" type="number" step="0.01" value="${m.nutrients[n]}">`).join("");

  document.getElementById("overlayRoot").innerHTML = `
  <div class="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="sheet">
      <div class="sheet-title">${editing ? "Edit meal" : "Create meal"}</div>

      <div class="photo-upload" onclick="document.getElementById('f_photo_input').click()">
        ${m.photo ? `<img class="meal-photo" src="${m.photo}" id="f_photo_preview">` : `<div id="f_photo_preview">Tap to add a photo of this meal</div>`}
        <input type="file" accept="image/*" id="f_photo_input" onchange="handleMealPhoto(this)">
      </div>
      <input type="hidden" id="f_photo_data" value="${m.photo ? escapeAttr(m.photo) : ''}">
      ${m.photo ? `<button class="secondary small" style="margin-top:6px" onclick="clearMealPhoto()">Remove photo</button>` : ""}

      <div class="form-grid">
        <label class="full">Name</label>
        <input class="full" id="f_name" value="${escapeAttr(m.name)}">
        <label class="full">Category</label>
        <select class="full" id="f_cat">${CATEGORIES.map(c => `<option ${c === m.category ? "selected" : ""}>${c}</option>`).join("")}</select>
      </div>

      <label class="full" style="margin-top:14px">Build from stored foods (quantity by weight)</label>
      <div class="section-note">Pick foods from your library and enter grams — macros and micros below fill in automatically as you add or edit rows.</div>
      <div id="mealFoodRows"></div>
      <button class="secondary small" onclick="addMealFoodRow()">+ Add food from library</button>

      <div class="form-grid" style="margin-top:12px">
        ${macroRows}

        <label class="full">Ingredients (auto-filled from foods above, or type your own)</label>
        <input class="full" id="f_ing" value="${escapeAttr((m.ingredients || []).join(", "))}">
      </div>

      <div class="nutrient-section-toggle" onclick="document.getElementById('microBlock').style.display=document.getElementById('microBlock').style.display==='none'?'grid':'none'">
        <span>Micronutrients (vitamins &amp; minerals) — tap to expand</span><span>&#8964;</span>
      </div>
      <div class="form-grid" id="microBlock" style="display:none">${microRows}</div>

      <div class="row" style="margin-top:14px">
        <button onclick="saveMealForm(${editing ? i : -1})">${editing ? "Save changes" : "Create"}</button>
        <button class="secondary" onclick="closeOverlay()">Cancel</button>
      </div>
    </div>
  </div>`;

  window._mealFoodCount = 0;
  (m.foodItems || []).forEach(it => addMealFoodRow(it.food, it.grams));
}

function addMealFoodRow(food, grams) {
  let idx = window._mealFoodCount++;
  let options = foods.map(f => `<option value="${escapeAttr(f.name)}" ${food === f.name ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("");
  document.getElementById("mealFoodRows").insertAdjacentHTML("beforeend", `
    <div class="row" id="mf_row_${idx}" style="margin-bottom:6px">
      <select style="flex:2" id="mf_food_${idx}" onchange="recomputeMealFromFoods()">
        <option value="">Select food...</option>${options}
      </select>
      <input style="flex:1" id="mf_grams_${idx}" type="number" min="0" step="1" placeholder="grams" value="${grams || ''}" oninput="recomputeMealFromFoods()">
      <button class="delete small" onclick="removeMealFoodRow(${idx})">&times;</button>
    </div>`);
}

function removeMealFoodRow(idx) {
  let row = document.getElementById(`mf_row_${idx}`);
  if (row) row.remove();
  recomputeMealFromFoods();
}

function recomputeMealFromFoods() {
  let total = emptyNutrients();
  let parts = [];
  let any = false;
  for (let idx = 0; idx < window._mealFoodCount; idx++) {
    let sel = document.getElementById(`mf_food_${idx}`);
    let gramsEl = document.getElementById(`mf_grams_${idx}`);
    if (!sel || !gramsEl || !sel.value) continue;
    let grams = Number(gramsEl.value) || 0;
    let food = foods.find(f => f.name === sel.value);
    if (!food || grams <= 0) continue;
    any = true;
    let factor = grams / 100;
    ALL_NUTRIENTS.forEach(n => total[n] += (food.per100g[n] || 0) * factor);
    parts.push(`${grams}g ${food.name}`);
  }
  if (!any) return;
  ALL_NUTRIENTS.forEach(n => { let el = document.getElementById(`f_${n}`); if (el) el.value = round1(total[n]); });
  let ingEl = document.getElementById("f_ing");
  if (ingEl) ingEl.value = parts.join(", ");
}

function handleMealPhoto(input) {
  if (!input.files.length) return;
  readAndResizeImage(input.files[0], 500, dataUrl => {
    document.getElementById("f_photo_data").value = dataUrl;
    document.getElementById("f_photo_preview").outerHTML = `<img class="meal-photo" src="${dataUrl}" id="f_photo_preview">`;
  });
}
function clearMealPhoto() {
  document.getElementById("f_photo_data").value = "";
  document.getElementById("f_photo_preview").outerHTML = `<div id="f_photo_preview">Tap to add a photo of this meal</div>`;
}

function saveMealForm(i) {
  let nutrients = emptyNutrients();
  ALL_NUTRIENTS.forEach(n => { let el = document.getElementById(`f_${n}`); if (el) nutrients[n] = Number(el.value) || 0; });
  let foodItems = [];
  for (let idx = 0; idx < (window._mealFoodCount || 0); idx++) {
    let sel = document.getElementById(`mf_food_${idx}`), gramsEl = document.getElementById(`mf_grams_${idx}`);
    if (sel && gramsEl && sel.value && Number(gramsEl.value) > 0) foodItems.push({ food: sel.value, grams: Number(gramsEl.value) });
  }
  let m = {
    name: document.getElementById("f_name").value.trim() || "Unnamed Meal",
    category: document.getElementById("f_cat").value,
    photo: document.getElementById("f_photo_data").value || null,
    nutrients,
    foodItems,
    ingredients: document.getElementById("f_ing").value.split(",").map(s => s.trim()).filter(Boolean)
  };
  if (i >= 0) templates[i] = m; else templates.push(m);
  save(); closeOverlay(); renderMeals();
}

function openQuickAdd() {
  document.getElementById("overlayRoot").innerHTML = `
  <div class="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="sheet">
      <div class="sheet-title">Quick log (one-off food)</div>
      <div class="section-note">Logs to today only — won't be saved as a reusable meal template. Use the Foods tab for items with full nutrition presets.</div>
      <div class="form-grid">
        <label class="full">Name</label>
        <input class="full" id="q_name" placeholder="e.g. Banana">
        <label>Calories</label><input id="q_cal" type="number" value="0">
        <label>Protein (g)</label><input id="q_protein" type="number" value="0">
        <label>Carbs (g)</label><input id="q_carbs" type="number" value="0">
        <label>Fat (g)</label><input id="q_fat" type="number" value="0">
        <label>Fiber (g)</label><input id="q_fiber" type="number" value="0">
        <label>Category</label>
        <select id="q_cat">${CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select>
      </div>
      <div class="row" style="margin-top:14px">
        <button onclick="confirmQuickAdd()">Log it</button>
        <button class="secondary" onclick="closeOverlay()">Cancel</button>
      </div>
    </div>
  </div>`;
}

function confirmQuickAdd() {
  let name = document.getElementById("q_name").value.trim() || "Quick item";
  let nutrients = emptyNutrients();
  nutrients.cal = Number(document.getElementById("q_cal").value) || 0;
  nutrients.protein = Number(document.getElementById("q_protein").value) || 0;
  nutrients.carbs = Number(document.getElementById("q_carbs").value) || 0;
  nutrients.fat = Number(document.getElementById("q_fat").value) || 0;
  nutrients.fiber = Number(document.getElementById("q_fiber").value) || 0;
  today.entries.push({ name, category: document.getElementById("q_cat").value, servings: 1, photo: null, time: new Date().toTimeString().slice(0, 5), nutrients });
  save(); closeOverlay(); tab("meals");
}

/* ============================================================
   FOODS TAB — reference library with editable serving presets
   ============================================================ */

function renderFoods() {
  let filtered = foods.map((f, i) => ({ f, i }))
    .filter(({ f }) => !foodSearch || f.name.toLowerCase().includes(foodSearch.toLowerCase()))
    .sort((a, b) => (b.f.pinned ? 1 : 0) - (a.f.pinned ? 1 : 0));

  let html = `<h2 class="page-title">Foods</h2>
  <div class="section-note">Reference nutrition per 100g/100ml with common serving presets. Log a preset straight to today, or edit the numbers for your own brand.</div>
  <div class="search-wrap"><input placeholder="Search foods..." value="${escapeAttr(foodSearch)}" oninput="foodSearch=this.value;renderFoods()"></div>
  <div class="row" style="margin-bottom:12px">
    <button onclick="openFoodForm()">Add food manually</button>
    <button class="secondary" onclick="openAiFoodFlow()">Add food with AI</button>
  </div>`;

  if (!filtered.length) html += `<div class="card"><div class="empty">No foods match your search.</div></div>`;

  filtered.forEach(({ f, i }) => {
    html += `<div class="card">
      <div class="spread"><b>${f.pinned ? "&#128204; " : ""}${escapeHtml(f.name)}</b><span class="tag">${f.category || "Other"}</span></div>
      <div class="ingredients">Per 100g: ${round1(f.per100g.cal)} kcal &middot; P ${round1(f.per100g.protein)}g &middot; C ${round1(f.per100g.carbs)}g &middot; F ${round1(f.per100g.fat)}g</div>
      <div class="row">${(f.presets || []).map((p, pi) => `<button class="secondary small" onclick="logFoodPreset(${i},${pi})">${escapeHtml(p.label)}</button>`).join("")}</div>
      <div class="row" style="margin-top:8px">
        <button class="edit small" onclick="openFoodForm(${i})">Edit</button>
        <button class="secondary small" onclick="toggleFoodPin(${i})">${f.pinned ? "Unpin" : "Pin"}</button>
        <button class="delete small" onclick="deleteFood(${i})">Delete</button>
      </div>
    </div>`;
  });

  document.getElementById("foods").innerHTML = html;
}

function toggleFoodPin(i) { foods[i].pinned = !foods[i].pinned; save(); renderFoods(); }

function logFoodPreset(i, pi) {
  let f = foods[i], p = f.presets[pi];
  let factor = p.grams / 100;
  today.entries.push({
    name: `${f.name} (${p.label})`, category: "Snack", servings: 1, photo: null,
    time: new Date().toTimeString().slice(0, 5),
    nutrients: scaleNutrients(f.per100g, factor)
  });
  save(); tab("meals");
}

function deleteFood(i) {
  if (confirm("Delete this food from your library?")) { foods.splice(i, 1); save(); renderFoods(); }
}

function openFoodForm(i) {
  let editing = i !== undefined && i !== null && i >= 0;
  let f = editing ? foods[i] : { name: "", category: "Other", per100g: emptyNutrients(), presets: [{ label: "100g", grams: 100 }] };

  let macroRows = NUTRIENT_GROUPS.macro.map(n => `
    <label>${NUTRIENT_META[n].label} (${NUTRIENT_META[n].unit})</label>
    <input id="ff_${n}" type="number" step="0.1" value="${f.per100g[n]}">`).join("");
  let microRows = [...NUTRIENT_GROUPS.vitamins, ...NUTRIENT_GROUPS.minerals].map(n => `
    <label>${NUTRIENT_META[n].label} (${NUTRIENT_META[n].unit})</label>
    <input id="ff_${n}" type="number" step="0.01" value="${f.per100g[n]}">`).join("");
  let presetRows = (f.presets || []).map((p, pi) => `
    <div class="row">
      <input style="flex:2" id="fp_label_${pi}" value="${escapeAttr(p.label)}" placeholder="Serving label">
      <input style="flex:1" id="fp_grams_${pi}" type="number" value="${p.grams}" placeholder="grams">
    </div>`).join("");

  document.getElementById("overlayRoot").innerHTML = `
  <div class="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="sheet">
      <div class="sheet-title">${editing ? "Edit food" : "Add food manually"}</div>
      <div class="form-grid">
        <label class="full">Name</label>
        <input class="full" id="ff_name" value="${escapeAttr(f.name)}">
        <label class="full">Category</label>
        <input class="full" id="ff_cat" value="${escapeAttr(f.category)}" placeholder="Protein, Dairy, Fruit...">
      </div>
      <div class="section-note">All values are per 100g (or 100ml for liquids).</div>
      <div class="form-grid">${macroRows}</div>
      <div class="nutrient-section-toggle" onclick="document.getElementById('ffMicroBlock').style.display=document.getElementById('ffMicroBlock').style.display==='none'?'grid':'none'">
        <span>Micronutrients — tap to expand</span><span>&#8964;</span>
      </div>
      <div class="form-grid" id="ffMicroBlock" style="display:none">${microRows}</div>

      <label class="full" style="margin-top:12px">Serving presets</label>
      <div id="presetRows">${presetRows}</div>
      <button class="secondary small" style="margin-top:6px" onclick="addPresetRow()">+ Add preset</button>

      <div class="row" style="margin-top:14px">
        <button onclick="saveFoodForm(${editing ? i : -1})">${editing ? "Save changes" : "Add to library"}</button>
        <button class="secondary" onclick="closeOverlay()">Cancel</button>
      </div>
    </div>
  </div>`;
  window._presetCount = (f.presets || []).length;
}

function addPresetRow() {
  let idx = window._presetCount++;
  document.getElementById("presetRows").insertAdjacentHTML("beforeend", `
    <div class="row">
      <input style="flex:2" id="fp_label_${idx}" placeholder="Serving label">
      <input style="flex:1" id="fp_grams_${idx}" type="number" placeholder="grams">
    </div>`);
}

function saveFoodForm(i) {
  let per100g = emptyNutrients();
  ALL_NUTRIENTS.forEach(n => { let el = document.getElementById(`ff_${n}`); if (el) per100g[n] = Number(el.value) || 0; });
  let presets = [];
  for (let pi = 0; pi < window._presetCount; pi++) {
    let labelEl = document.getElementById(`fp_label_${pi}`), gramsEl = document.getElementById(`fp_grams_${pi}`);
    if (labelEl && gramsEl && labelEl.value.trim() && Number(gramsEl.value) > 0) presets.push({ label: labelEl.value.trim(), grams: Number(gramsEl.value) });
  }
  if (!presets.length) presets.push({ label: "100g", grams: 100 });
  let f = { name: document.getElementById("ff_name").value.trim() || "Unnamed food", category: document.getElementById("ff_cat").value.trim() || "Other", per100g, presets };
  if (i >= 0) foods[i] = f; else foods.push(f);
  save(); closeOverlay(); renderFoods();
}

/* ---- AI-assisted food import ---- */

function openAiFoodFlow() {
  document.getElementById("overlayRoot").innerHTML = `
  <div class="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="sheet">
      <div class="sheet-title">Add a food with AI</div>
      <div class="section-note">Step 1 — type the food name, copy the prompt below, and paste it into any AI chat (Claude, ChatGPT, etc). Step 2 — paste the AI's JSON reply back here and parse it.</div>
      <label>Food name</label>
      <input id="ai_food_name" placeholder="e.g. Moong dal, cooked" oninput="document.getElementById('ai_prompt_box').value=buildAiFoodPrompt(this.value)">
      <label>Prompt to copy</label>
      <textarea id="ai_prompt_box" readonly>${escapeHtml(buildAiFoodPrompt(""))}</textarea>
      <button class="secondary small" style="margin-top:6px" onclick="copyAiPrompt()">Copy prompt</button>

      <label style="margin-top:16px">Paste the AI's JSON reply here</label>
      <textarea id="ai_response_box" placeholder="Paste the JSON object the AI gave you..."></textarea>
      <div id="ai_parse_error" class="section-note" style="color:var(--danger)"></div>

      <div class="row" style="margin-top:14px">
        <button onclick="parseAndPrefillAiFood()">Parse &amp; review</button>
        <button class="secondary" onclick="closeOverlay()">Cancel</button>
      </div>
    </div>
  </div>`;
}

function copyAiPrompt() {
  let box = document.getElementById("ai_prompt_box");
  box.select();
  try { navigator.clipboard.writeText(box.value); } catch (e) { document.execCommand("copy"); }
}

function parseAndPrefillAiFood() {
  try {
    let parsed = parseAiFoodJson(document.getElementById("ai_response_box").value);
    foods.push(parsed);
    save();
    closeOverlay();
    renderFoods();
    let idx = foods.length - 1;
    openFoodForm(idx); // let the user review/adjust before it's final
  } catch (err) {
    document.getElementById("ai_parse_error").textContent = "Couldn't parse that: " + err.message;
  }
}

/* ============================================================
   NUTRITION TAB
   ============================================================ */

const NUTRITION_SUBTABS = [
  { id: "overview", label: "Overview" },
  { id: "contrib", label: "By Nutrient" },
  { id: "byfood", label: "By Food" },
  { id: "limit", label: "Limit List" },
  { id: "density", label: "Density" }
];

let nutritionSubTab = "overview";
let contribNutrient = "protein";
let byFoodEntryIndex = 0;

function renderNutrition() {
  let t = sumEntries(today.entries);
  let html = `<h2 class="page-title">Nutrition — Today</h2>`;
  html += `<div class="chip-row">`;
  NUTRITION_SUBTABS.forEach(st => html += `<div class="chip ${nutritionSubTab === st.id ? 'active' : ''}" onclick="nutritionSubTab='${st.id}';renderNutrition()">${st.label}</div>`);
  html += `</div>`;

  let totalMacroCal = 0;
  if (nutritionSubTab === "contrib") html += renderNutrientContributors(t);
  else if (nutritionSubTab === "byfood") html += renderByFood();
  else if (nutritionSubTab === "limit") html += renderLimitList();
  else if (nutritionSubTab === "density") html += renderDensityList();
  else {
    let overview = renderNutritionOverview(t);
    html += overview.html;
    totalMacroCal = overview.totalMacroCal;
  }

  document.getElementById("nutrition").innerHTML = html;

  if (nutritionSubTab === "overview" && totalMacroCal > 0) {
    let pCal = t.protein * 4, cCal = t.carbs * 4, fCal = t.fat * 9;
    new Chart(document.getElementById("macroPie"), {
      type: "doughnut",
      data: { labels: ["Protein", "Carbs", "Fat"], datasets: [{ data: [pCal, cCal, fCal], backgroundColor: ["#3ddc97", "#5b9bf7", "#f5b942"], borderWidth: 0 }] },
      options: { plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue("--text") } } } }
    });
  }
}

function renderNutritionOverview(t) {
  let html = `<div class="card">`;
  NUTRIENT_GROUPS.macro.forEach(n => html += nutrientRow(n, t));
  html += `</div>`;

  let pCal = t.protein * 4, cCal = t.carbs * 4, fCal = t.fat * 9, totalMacroCal = pCal + cCal + fCal;
  html += `<div class="card"><h3>Calorie breakdown</h3>${totalMacroCal > 0 ? `<canvas id="macroPie" height="180"></canvas>` : `<div class="empty">Log something to see the breakdown.</div>`}</div>`;

  html += `<div class="card"><h3>Vitamins</h3>`;
  NUTRIENT_GROUPS.vitamins.forEach(n => html += nutrientRow(n, t));
  html += `</div><div class="card"><h3>Minerals</h3>`;
  NUTRIENT_GROUPS.minerals.forEach(n => html += nutrientRow(n, t));
  html += `</div>`;

  if (settings.proteinMode === "lbm") html += `<div class="section-note">Protein target is calculated from your latest body-fat entry (lean mass &times; ${settings.proteinPerKgLBM}g/kg). Update it in Body, or change the mode in Data.</div>`;

  html += renderGapCard(t);
  return { html, totalMacroCal };
}

/* ---- By Nutrient: which logged foods contributed to a given nutrient ---- */

function renderNutrientContributors(t) {
  let html = `<div class="card">
    <label>Nutrient</label>
    <select onchange="contribNutrient=this.value;renderNutrition()">
      ${ALL_NUTRIENTS.map(n => `<option value="${n}" ${n === contribNutrient ? "selected" : ""}>${NUTRIENT_META[n].label}</option>`).join("")}
    </select>
  </div>`;

  let total = t[contribNutrient] || 0;
  let rows = today.entries
    .map(e => ({ name: e.name, val: e.nutrients[contribNutrient] || 0 }))
    .filter(r => r.val > 0)
    .sort((a, b) => b.val - a.val);

  html += `<div class="card"><h3>${NUTRIENT_META[contribNutrient].label} contributors today</h3>`;
  if (!rows.length) {
    html += `<div class="empty">Nothing logged today contributes ${NUTRIENT_META[contribNutrient].label.toLowerCase()}.</div>`;
  } else {
    rows.forEach(r => {
      let pct = total > 0 ? round1(r.val / total * 100) : 0;
      html += `<div class="today-item"><div>${escapeHtml(r.name)}</div><div class="meta">${round1(r.val)} ${NUTRIENT_META[contribNutrient].unit} &middot; ${pct}%</div></div>`;
    });
    html += `<div class="ingredients" style="margin-top:10px">Today's total: ${round1(total)} ${NUTRIENT_META[contribNutrient].unit}</div>`;
  }
  html += `</div>`;
  return html;
}

/* ---- By Food: what nutrients a specific logged item is giving you ---- */

function renderByFood() {
  if (!today.entries.length) {
    return `<div class="card"><div class="empty">Log something today to see its nutrient breakdown.</div></div>`;
  }
  if (byFoodEntryIndex >= today.entries.length) byFoodEntryIndex = 0;

  let html = `<div class="card">
    <label>Food</label>
    <select onchange="byFoodEntryIndex=Number(this.value);renderNutrition()">
      ${today.entries.map((e, i) => `<option value="${i}" ${i === byFoodEntryIndex ? "selected" : ""}>${escapeHtml(e.name)}</option>`).join("")}
    </select>
  </div>`;

  let e = today.entries[byFoodEntryIndex];
  let rows = ALL_NUTRIENTS
    .filter(n => (e.nutrients[n] || 0) > 0)
    .sort((a, b) => {
      let ta = targetFor(a), tb = targetFor(b);
      let pa = ta ? e.nutrients[a] / ta : 0, pb = tb ? e.nutrients[b] / tb : 0;
      return pb - pa;
    });

  html += `<div class="card"><h3>${escapeHtml(e.name)} — nutrients provided</h3>`;
  if (!rows.length) {
    html += `<div class="empty">No nutrient data recorded for this entry.</div>`;
  } else {
    rows.forEach(n => {
      let val = e.nutrients[n], target = targetFor(n);
      let pct = target ? round1(val / target * 100) : null;
      html += `<div class="today-item"><div>${NUTRIENT_META[n].label}</div><div class="meta">${round1(val)} ${NUTRIENT_META[n].unit}${pct !== null ? ` &middot; ${pct}% of target` : ""}</div></div>`;
    });
  }
  html += `</div>`;
  return html;
}

/* ---- Limit List: today's biggest calorie and sugar sources ---- */

function renderLimitList() {
  let html = `<div class="section-note">Today's logged items ranked by how much they're driving calories and sugar — the biggest levers if you want to cut back.</div>`;

  function topList(key, label, unit) {
    let rows = today.entries
      .map(e => ({ name: e.name, val: e.nutrients[key] || 0 }))
      .filter(r => r.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, 8);
    let block = `<div class="card"><h3>Biggest ${label} sources</h3>`;
    if (!rows.length) block += `<div class="empty">Nothing logged yet today.</div>`;
    else rows.forEach(r => block += `<div class="today-item"><div>${escapeHtml(r.name)}</div><div class="meta">${round1(r.val)} ${unit}</div></div>`);
    block += `</div>`;
    return block;
  }

  html += topList("cal", "calorie", "kcal");
  html += topList("sugar", "sugar", "g");
  return html;
}

/* ---- Density: which library foods pack the most nutrition per calorie ---- */

function nutrientDensityScore(per100g) {
  let cal = per100g.cal;
  if (!cal || cal <= 0) return null;
  let score = 0;
  ALL_NUTRIENTS.forEach(n => {
    if (n === "cal" || n === "sugar") return;
    let target = settings.targets[n];
    if (target > 0) score += (per100g[n] || 0) / target;
  });
  return score / (cal / 100);
}

function renderDensityList() {
  let rows = foods
    .filter(f => f.category !== "Supplement")
    .map(f => ({ name: f.name, cal: f.per100g.cal, score: nutrientDensityScore(f.per100g) }))
    .filter(r => r.score !== null)
    .sort((a, b) => b.score - a.score);

  let html = `<div class="section-note">Ranks your Foods library by overall nutrient coverage per 100 calories (sugar excluded from the score) — higher means more vitamins/minerals/protein for the calories it costs.</div>
  <div class="card"><h3>Most nutrition per calorie</h3>`;
  if (!rows.length) html += `<div class="empty">Add some foods with calories to your library to see this ranking.</div>`;
  else rows.forEach((r, idx) => html += `<div class="today-item"><div>${idx + 1}. ${escapeHtml(r.name)}</div><div class="meta">${round1(r.cal)} kcal/100g &middot; score ${round1(r.score * 100)}</div></div>`);
  html += `</div>`;
  return html;
}

function nutrientRow(n, t) {
  let target = targetFor(n), val = t[n] || 0;
  let pct = target ? Math.min(100, (val / target) * 100) : 0;
  let over = target && val > target;
  return `<div class="metric-row">
    <div class="metric-label"><span>${NUTRIENT_META[n].label}</span><span class="val">${round1(val)}${target ? ` / ${round1(target)}` : ""} ${NUTRIENT_META[n].unit}</span></div>
    <div class="progress"><div class="bar ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
  </div>`;
}

/* ============================================================
   "Fill the Gap" — suggests quantities of foods/supplements from
   the library to close today's remaining nutrient targets.
   ============================================================ */

function nutritionGapSuggestions(t) {
  let gap = n => Math.max(0, (targetFor(n) || 0) - (t[n] || 0));
  let lines = [];

  // Omega-3 is special-cased: a fixed EPA/DHA capsule first, then
  // ground flaxseed to cover whatever ALA is still short after that.
  let omega3Gap = gap("omega3");
  if (omega3Gap > 0.05) {
    let tabletFood = foods.find(f => f.name === "Omega-3 EPA/DHA (Tata 1mg)");
    let flaxFood = foods.find(f => f.name === "Flaxseed, ground");
    let covered = 0;
    if (tabletFood) {
      covered = tabletFood.per100g.omega3 || 0;
      lines.push({ text: "1 capsule Omega-3 EPA/DHA (Tata 1mg)", note: `Omega-3 (~${round1(covered)}g EPA/DHA)` });
    }
    let remaining = omega3Gap - covered;
    if (remaining > 0.1 && flaxFood && flaxFood.per100g.omega3 > 0) {
      let grams = Math.min(21, Math.ceil((remaining * 100 / flaxFood.per100g.omega3) / 7) * 7);
      if (grams > 0) lines.push({ text: `${grams}g Flaxseed, ground (~${Math.round(grams / 7)} tbsp)`, note: "Omega-3 (ALA)" });
    }
  }

  FILLER_MAP.forEach(entry => {
    let food = foods.find(f => f.name === entry.food);
    if (!food) return;
    let neededGrams = 0;
    let covers = [];
    entry.nutrients.forEach(n => {
      let g = gap(n);
      let per100 = food.per100g[n] || 0;
      if (g > 0 && per100 > 0) {
        covers.push(n);
        neededGrams = Math.max(neededGrams, g * 100 / per100);
      }
    });
    if (!covers.length) return;
    neededGrams = Math.min(entry.maxGrams, Math.ceil(neededGrams / entry.roundTo) * entry.roundTo);
    if (neededGrams <= 0) return;
    let qty = entry.niceUnit
      ? `${Math.ceil(neededGrams / entry.niceUnit.grams)} ${entry.niceUnit.label}${Math.ceil(neededGrams / entry.niceUnit.grams) > 1 ? "s" : ""} (~${neededGrams}g)`
      : `${neededGrams}g`;
    lines.push({ text: `${qty} ${food.name}`, note: covers.map(n => NUTRIENT_META[n].label).join(", ") });
  });

  FILLER_SUPPLEMENTS.forEach(entry => {
    let food = foods.find(f => f.name === entry.food);
    if (!food) return;
    let units = 0, covers = [];
    entry.nutrients.forEach(n => {
      let g = gap(n);
      let per = food.per100g[n] || 0;
      if (g > 0 && per > 0) { covers.push(n); units = Math.max(units, Math.ceil(g / per)); }
    });
    if (!covers.length) return;
    units = Math.min(entry.maxUnits, units);
    lines.push({ text: `${units} ${entry.unitLabel}${units > 1 ? "s" : ""} ${food.name}`, note: covers.map(n => NUTRIENT_META[n].label).join(", ") });
  });

  return lines;
}

function renderGapCard(t) {
  let lines = nutritionGapSuggestions(t);
  let html = `<div class="card"><h3>Fill the Gap</h3>`;
  if (!lines.length) {
    html += `<div class="empty">You're on track — no notable gaps right now.</div>`;
  } else {
    html += `<div class="section-note">Rough suggestions to close today's remaining targets, based on your Foods library. Supplement doses are typical approximations — edit them in the Foods tab to match your product's actual label.</div>`;
    lines.forEach(l => html += `<div class="today-item"><div>${escapeHtml(l.text)}</div><div class="meta">${escapeHtml(l.note)}</div></div>`);
  }
  html += `</div>`;
  return html;
}

/* ============================================================
   BODY TAB
   ============================================================ */

function renderBody() {
  let latest = bodyLog.length ? bodyLog[bodyLog.length - 1] : { weight: 70, bf: 20 };
  let html = `<h2 class="page-title">Body</h2>
  <div class="card"><h3>Log an entry</h3>
    <label>Weight (kg)</label><input id="bw" type="number" step="0.1" value="${latest.weight ?? ''}">
    <label>Body fat %</label><input id="bbf" type="number" step="0.1" value="${latest.bf ?? ''}">

    <div class="nutrient-section-toggle" onclick="document.getElementById('bodyMoreBlock').style.display=document.getElementById('bodyMoreBlock').style.display==='none'?'grid':'none'">
      <span>More measurements — tap to expand</span><span>&#8964;</span>
    </div>
    <div class="form-grid" id="bodyMoreBlock" style="display:none">
      ${BODY_METRICS.map(m => `<label>${m.label} (${m.unit})</label><input id="bm_${m.id}" type="number" step="0.1" value="${latest[m.id] ?? ''}">`).join("")}
      <label class="full">Notes</label>
      <textarea class="full" id="bnotes">${escapeHtml(latest.notes || "")}</textarea>
    </div>

    <button style="margin-top:12px" onclick="saveBodyEntry()">Save entry for today</button>
  </div>`;

  if (bodyLog.length > 1) html += `<div class="card"><h3>Weight trend</h3><canvas id="weightChart" height="160"></canvas></div>`;

  html += renderBodyPhotoCard();

  html += `<div class="card"><h3>History</h3>`;
  if (!bodyLog.length) html += `<div class="empty">No entries yet.</div>`;
  else [...bodyLog].reverse().slice(0, 20).forEach(b => {
    let extras = BODY_METRICS.filter(m => b[m.id] !== undefined && b[m.id] !== null && b[m.id] !== "").map(m => `${m.label} ${b[m.id]}${m.unit}`).join(" &middot; ");
    html += `<div class="today-item">
      <div>${b.date}${b.notes ? `<div class="meta">${escapeHtml(b.notes)}</div>` : ""}</div>
      <div class="meta">${b.weight}kg${b.bf ? ` &middot; ${b.bf}% BF` : ""}${extras ? ` &middot; ${extras}` : ""}</div>
    </div>`;
  });
  html += `</div>`;

  document.getElementById("body").innerHTML = html;

  if (bodyLog.length > 1) {
    let axisColor = getComputedStyle(document.body).getPropertyValue("--muted");
    new Chart(document.getElementById("weightChart"), {
      type: "line",
      data: { labels: bodyLog.map(b => b.date), datasets: [{ label: "Weight (kg)", data: bodyLog.map(b => b.weight), borderColor: "#5b9bf7", tension: .3 }] },
      options: { scales: { x: { ticks: { color: axisColor } }, y: { ticks: { color: axisColor } } }, plugins: { legend: { labels: { color: axisColor } } } }
    });
  }
}

function saveBodyEntry() {
  let weight = Number(document.getElementById("bw").value), bf = Number(document.getElementById("bbf").value);
  if (!weight) { alert("Enter a weight."); return; }
  let date = todayStr(), existing = bodyLog.find(b => b.date === date);
  let entry = existing || { date };
  entry.weight = weight;
  entry.bf = bf;
  BODY_METRICS.forEach(m => {
    let el = document.getElementById(`bm_${m.id}`);
    if (el && el.value !== "") entry[m.id] = Number(el.value);
    else delete entry[m.id];
  });
  let notesEl = document.getElementById("bnotes");
  entry.notes = notesEl ? notesEl.value.trim() : "";
  if (!existing) bodyLog.push(entry);
  bodyLog.sort((a, b) => a.date.localeCompare(b.date));
  save(); renderBody();
}

/* ============================================================
   BODY PROGRESS PHOTOS — PIN-gated, saved after crop/zoom
   ============================================================ */

async function sha256Hex(str) {
  let buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function renderBodyPhotoCard() {
  let html = `<div class="card" id="bodyPhotoCard"><div class="spread"><h3>Progress Photos</h3>`;
  if (bodyPhotosUnlocked) html += `<button class="secondary small" onclick="lockBodyPhotos()">Lock</button>`;
  html += `</div>`;

  if (!settings.bodyPin) {
    html += `<div class="section-note">Set a PIN to keep progress photos hidden on this device. You'll need it every time you want to view or add one.</div>
    <label>New PIN</label><input id="bp_newpin1" type="password" inputmode="numeric" autocomplete="off">
    <label>Confirm PIN</label><input id="bp_newpin2" type="password" inputmode="numeric" autocomplete="off">
    <button style="margin-top:10px" onclick="setBodyPin()">Set PIN</button>`;
  } else if (!bodyPhotosUnlocked) {
    html += `<div class="empty">Enter your PIN to view photos.</div>
    <input id="bp_pin_input" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" onkeydown="if(event.key==='Enter')unlockBodyPhotos()">
    <button style="margin-top:10px" onclick="unlockBodyPhotos()">Unlock</button>`;
  } else {
    html += `<div class="row"><button onclick="openBodyPhotoCapture()">+ Add photo</button><button class="secondary small" onclick="resetBodyPin()">Reset PIN</button></div>`;
    if (!bodyPhotos.length) {
      html += `<div class="empty">No photos yet.</div>`;
    } else {
      if (bodyCompareSelection.length === 2) {
        let a = bodyPhotos.find(p => p.id === bodyCompareSelection[0]);
        let b = bodyPhotos.find(p => p.id === bodyCompareSelection[1]);
        if (a && b) {
          html += `<div class="section-note" style="margin-top:10px">Comparing</div>
          <div class="compare-wrap">
            <div><img class="compare-img" src="${a.data}"><div class="meta">${a.date}${a.label ? " &middot; " + escapeHtml(a.label) : ""}</div></div>
            <div><img class="compare-img" src="${b.data}"><div class="meta">${b.date}${b.label ? " &middot; " + escapeHtml(b.label) : ""}</div></div>
          </div>
          <button class="secondary small" onclick="bodyCompareSelection=[];renderBody()">Clear comparison</button>`;
        }
      }
      html += `<div class="section-note" style="margin-top:10px">Tap two photos to compare them side by side.</div><div class="photo-grid">`;
      [...bodyPhotos].reverse().forEach(p => {
        let sel = bodyCompareSelection.includes(p.id);
        html += `<div class="photo-tile ${sel ? "selected" : ""}" onclick="toggleCompare(${p.id})">
          <img src="${p.data}">
          <div class="meta">${p.date}${p.label ? " &middot; " + escapeHtml(p.label) : ""}</div>
          <button class="delete small" onclick="event.stopPropagation();deleteBodyPhoto(${p.id})">&times;</button>
        </div>`;
      });
      html += `</div>`;
    }
  }
  html += `</div>`;
  return html;
}

async function setBodyPin() {
  let p1 = document.getElementById("bp_newpin1").value;
  let p2 = document.getElementById("bp_newpin2").value;
  if (!p1 || p1.length < 4) { alert("PIN must be at least 4 characters."); return; }
  if (p1 !== p2) { alert("PINs don't match."); return; }
  settings.bodyPin = await sha256Hex(p1);
  save();
  bodyPhotosUnlocked = true;
  renderBody();
}

async function unlockBodyPhotos() {
  let entered = document.getElementById("bp_pin_input").value;
  let hash = await sha256Hex(entered || "");
  if (hash === settings.bodyPin) { bodyPhotosUnlocked = true; renderBody(); }
  else alert("Incorrect PIN.");
}

function lockBodyPhotos() {
  bodyPhotosUnlocked = false;
  bodyCompareSelection = [];
  renderBody();
}

function resetBodyPin() {
  if (!confirm("Reset your progress photo PIN? You'll be asked to set a new one — existing photos stay right where they are.")) return;
  settings.bodyPin = "";
  bodyPhotosUnlocked = false;
  save(); renderBody();
}

function toggleCompare(id) {
  let idx = bodyCompareSelection.indexOf(id);
  if (idx >= 0) bodyCompareSelection.splice(idx, 1);
  else {
    bodyCompareSelection.push(id);
    if (bodyCompareSelection.length > 2) bodyCompareSelection.shift();
  }
  renderBody();
}

function deleteBodyPhoto(id) {
  if (!confirm("Delete this photo?")) return;
  bodyPhotos = bodyPhotos.filter(p => p.id !== id);
  bodyCompareSelection = bodyCompareSelection.filter(x => x !== id);
  save(); renderBody();
}

/* ---- Crop/zoom capture sheet ---- */

let cropState = null;

function openBodyPhotoCapture() {
  document.getElementById("overlayRoot").innerHTML = `
  <div class="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="sheet">
      <div class="sheet-title">Add progress photo</div>
      <div class="photo-upload" id="bp_upload_prompt" onclick="document.getElementById('bp_file_input').click()">Tap to choose a photo</div>
      <input type="file" accept="image/*" id="bp_file_input" style="display:none" onchange="handleBodyPhotoSelect(this)">

      <div id="bp_cropper_wrap" style="display:none">
        <div class="crop-viewport"><canvas id="bp_crop_canvas"></canvas></div>
        <label>Zoom</label>
        <input type="range" id="bp_zoom" min="1" max="3" step="0.01" value="1" oninput="renderCropCanvas()">
        <div class="section-note">Drag the photo to reposition it inside the frame.</div>
      </div>

      <label>Label (optional)</label>
      <input id="bp_label" placeholder="e.g. Front, Side, Back">

      <div class="row" style="margin-top:14px">
        <button onclick="saveBodyPhoto()">Save photo</button>
        <button class="secondary" onclick="closeOverlay()">Cancel</button>
      </div>
    </div>
  </div>`;
  cropState = null;
}

function handleBodyPhotoSelect(input) {
  if (!input.files.length) return;
  let reader = new FileReader();
  reader.onload = e => {
    let img = new Image();
    img.onload = () => {
      let canvas = document.getElementById("bp_crop_canvas");
      canvas.width = 300; canvas.height = 400;
      let baseScale = Math.max(canvas.width / img.width, canvas.height / img.height);
      cropState = { img, baseScale, zoom: 1, offX: 0, offY: 0 };
      document.getElementById("bp_upload_prompt").textContent = "Tap to choose a different photo";
      document.getElementById("bp_cropper_wrap").style.display = "block";
      document.getElementById("bp_zoom").value = 1;
      renderCropCanvas();
      wireCropEvents(canvas);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

function clampCropOffset() {
  let canvas = document.getElementById("bp_crop_canvas");
  let scale = cropState.baseScale * cropState.zoom;
  let dw = cropState.img.width * scale, dh = cropState.img.height * scale;
  let maxX = Math.max(0, (dw - canvas.width) / 2);
  let maxY = Math.max(0, (dh - canvas.height) / 2);
  cropState.offX = Math.min(maxX, Math.max(-maxX, cropState.offX));
  cropState.offY = Math.min(maxY, Math.max(-maxY, cropState.offY));
}

function renderCropCanvas() {
  if (!cropState) return;
  cropState.zoom = Number(document.getElementById("bp_zoom").value) || 1;
  clampCropOffset();
  let canvas = document.getElementById("bp_crop_canvas");
  let ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let scale = cropState.baseScale * cropState.zoom;
  let dw = cropState.img.width * scale, dh = cropState.img.height * scale;
  let dx = canvas.width / 2 - dw / 2 + cropState.offX;
  let dy = canvas.height / 2 - dh / 2 + cropState.offY;
  ctx.drawImage(cropState.img, dx, dy, dw, dh);
}

function wireCropEvents(canvas) {
  let drag = null;
  canvas.onpointerdown = e => {
    drag = { x: e.clientX, y: e.clientY, offX: cropState.offX, offY: cropState.offY };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drag) return;
    let rect = canvas.getBoundingClientRect();
    let ratio = canvas.width / rect.width;
    cropState.offX = drag.offX + (e.clientX - drag.x) * ratio;
    cropState.offY = drag.offY + (e.clientY - drag.y) * ratio;
    renderCropCanvas();
  };
  canvas.onpointerup = () => { drag = null; };
  canvas.onpointercancel = () => { drag = null; };
}

function saveBodyPhoto() {
  if (!cropState) { alert("Choose a photo first."); return; }
  let canvas = document.getElementById("bp_crop_canvas");
  let data = canvas.toDataURL("image/jpeg", 0.85);
  let label = document.getElementById("bp_label").value.trim();
  bodyPhotos.push({ id: Date.now(), date: todayStr(), label, data });
  bodyPhotos.sort((a, b) => a.date.localeCompare(b.date));
  cropState = null;
  save(); closeOverlay(); renderBody();
}

/* ============================================================
   WATER TAB
   ============================================================ */

function renderWater() {
  let d = todayStr(), count = water[d] || 0, target = settings.waterTarget;
  let html = `<h2 class="page-title">Water</h2>
  <div class="card">
    <div class="spread"><h3>Today</h3><span class="val" style="color:var(--muted)">${count} / ${target} glasses</span></div>
    <div class="progress"><div class="bar" style="width:${Math.min(100, (count / target) * 100)}%;background:var(--info)"></div></div>
    <div class="water-drops">`;
  for (let i = 0; i < Math.max(target, count); i++) html += `<div class="drop ${i < count ? 'filled' : ''}" onclick="setWater(${i + 1})">&#128167;</div>`;
  html += `</div><div class="row"><button class="secondary" onclick="adjustWater(-1)">&minus;1 glass</button><button onclick="adjustWater(1)">+1 glass</button></div></div>`;

  html += `<div class="card"><h3>Last 7 days</h3>`;
  last7Dates().forEach(ds => html += `<div class="today-item"><div>${ds}</div><div class="meta">${water[ds] || 0} glasses</div></div>`);
  html += `</div>`;

  document.getElementById("water").innerHTML = html;
}

function last7Dates() {
  let arr = [];
  for (let i = 6; i >= 0; i--) { let d = new Date(); d.setDate(d.getDate() - i); arr.push(d.toISOString().slice(0, 10)); }
  return arr;
}

function adjustWater(delta) { let d = todayStr(); water[d] = Math.max(0, (water[d] || 0) + delta); save(); renderWater(); }
function setWater(n) { water[todayStr()] = n; save(); renderWater(); }

/* ============================================================
   TRENDS TAB
   ============================================================ */

function renderTrends() {
  let html = `<h2 class="page-title">Trends</h2>`;
  let recentHistory = [...history].filter(h => h.totals && h.totals.cal > 0).slice(-30);
  let last7 = [...history].slice(-7);
  let avgCal = last7.length ? round1(last7.reduce((s, h) => s + (h.totals.cal || 0), 0) / last7.length) : 0;
  let avgProtein = last7.length ? round1(last7.reduce((s, h) => s + (h.totals.protein || 0), 0) / last7.length) : 0;

  html += `<div class="card"><h3>Last 7 logged days</h3><div class="stat-grid">
    <div class="stat"><div class="n">${avgCal}</div><div class="l">avg kcal</div></div>
    <div class="stat"><div class="n">${avgProtein}</div><div class="l">avg protein g</div></div>
    <div class="stat"><div class="n">${currentStreak()}</div><div class="l">day streak</div></div>
  </div></div>`;

  if (!recentHistory.length) html += `<div class="card"><div class="empty">Close a few days from the Meals tab to see trends here.</div></div>`;
  else {
    html += `<div class="card"><h3>Calories (last 30 logged days)</h3><canvas id="calChart" height="180"></canvas></div>`;
    html += `<div class="card"><h3>Protein (last 30 logged days)</h3><canvas id="proteinChart" height="180"></canvas></div>`;
  }

  document.getElementById("trends").innerHTML = html;

  if (recentHistory.length) {
    let axisColor = getComputedStyle(document.body).getPropertyValue("--muted");
    new Chart(document.getElementById("calChart"), {
      type: "line",
      data: { labels: recentHistory.map(h => h.date), datasets: [{ label: "Calories", data: recentHistory.map(h => h.totals.cal), borderColor: "#3ddc97", tension: .3 }] },
      options: { scales: { x: { ticks: { color: axisColor } }, y: { ticks: { color: axisColor } } }, plugins: { legend: { labels: { color: axisColor } } } }
    });
    new Chart(document.getElementById("proteinChart"), {
      type: "line",
      data: { labels: recentHistory.map(h => h.date), datasets: [{ label: "Protein (g)", data: recentHistory.map(h => h.totals.protein), borderColor: "#5b9bf7", tension: .3 }] },
      options: { scales: { x: { ticks: { color: axisColor } }, y: { ticks: { color: axisColor } } }, plugins: { legend: { labels: { color: axisColor } } } }
    });
  }
}

/* ============================================================
   SETTINGS / DATA TAB
   ============================================================ */

function renderSettings() {
  let html = `<h2 class="page-title">Data &amp; Settings</h2>`;

  html += `<div class="card"><h3>Theme</h3><div class="theme-swatch">`;
  THEMES.forEach(th => {
    html += `<div class="theme-opt ${settings.theme === th.id ? 'active' : ''}" onclick="setTheme('${th.id}')">
      <div class="dots">${th.dots.map(c => `<div class="dot" style="background:${c}"></div>`).join("")}</div>
      ${th.label}
    </div>`;
  });
  html += `</div></div>`;

  html += `<div class="card"><h3>Daily targets</h3>`;
  NUTRIENT_GROUPS.macro.forEach(n => { if (n !== "protein") html += `<label>${NUTRIENT_META[n].label} (${NUTRIENT_META[n].unit})</label><input id="t_${n}" type="number" value="${settings.targets[n]}">`; });
  html += `<label>Protein target mode</label>
    <select id="t_proteinMode">
      <option value="manual" ${settings.proteinMode === "manual" ? "selected" : ""}>Fixed grams</option>
      <option value="lbm" ${settings.proteinMode === "lbm" ? "selected" : ""}>From lean body mass</option>
    </select>
    <div id="proteinManualWrap" style="${settings.proteinMode === 'lbm' ? 'display:none' : ''}"><label>Protein target (g)</label><input id="t_protein" type="number" value="${settings.targets.protein}"></div>
    <div id="proteinLbmWrap" style="${settings.proteinMode === 'manual' ? 'display:none' : ''}"><label>Protein g per kg of lean mass</label><input id="t_proteinPerKg" type="number" step="0.1" value="${settings.proteinPerKgLBM}"></div>
    <label>Water target (glasses/day)</label><input id="t_water" type="number" value="${settings.waterTarget}">

    <div class="nutrient-section-toggle" onclick="document.getElementById('targetMicroBlock').style.display=document.getElementById('targetMicroBlock').style.display==='none'?'block':'none'">
      <span>Vitamin &amp; mineral targets — tap to expand</span><span>&#8964;</span>
    </div>
    <div id="targetMicroBlock" style="display:none">
      ${[...NUTRIENT_GROUPS.vitamins, ...NUTRIENT_GROUPS.minerals].map(n => `<label>${NUTRIENT_META[n].label} (${NUTRIENT_META[n].unit})</label><input id="t_${n}" type="number" step="0.1" value="${settings.targets[n]}">`).join("")}
    </div>
    <button style="margin-top:12px" onclick="saveSettings()">Save targets</button>
  </div>`;

  html += `<div class="card"><h3>Backup</h3>
    <div class="section-note">Export regularly — all data (including meal and body photos) lives only in this browser's storage.</div>
    <div class="row"><button onclick="exportData()">Export JSON</button><button class="secondary" onclick="document.getElementById('importFile').click()">Import JSON</button></div>
    <input type="file" id="importFile" accept="application/json" style="display:none" onchange="importData(this)">
  </div>`;

  html += `<div class="card"><h3>History</h3>`;
  if (!history.length) html += `<div class="empty">No closed days yet.</div>`;
  else [...history].reverse().slice(0, 30).forEach(h => {
    let idx = history.indexOf(h);
    html += `<div class="today-item"><div><b>${h.date}</b><div class="meta">${round1(h.totals.cal)} kcal &middot; P ${round1(h.totals.protein)}g${h.weight ? ` &middot; ${h.weight}kg` : ""}</div></div><button class="delete small" onclick="deleteHistoryDay(${idx})">Delete</button></div>`;
  });
  html += `</div><div class="card"><button class="delete" onclick="clearData()">Erase all data</button></div>`;

  document.getElementById("settings").innerHTML = html;

  let pmSelect = document.getElementById("t_proteinMode");
  if (pmSelect) pmSelect.addEventListener("change", function () {
    document.getElementById("proteinManualWrap").style.display = this.value === "manual" ? "" : "none";
    document.getElementById("proteinLbmWrap").style.display = this.value === "lbm" ? "" : "none";
  });
}

function saveSettings() {
  ALL_NUTRIENTS.forEach(n => { if (n === "protein") return; let el = document.getElementById(`t_${n}`); if (el) settings.targets[n] = Number(el.value) || settings.targets[n]; });
  settings.targets.protein = Number(document.getElementById("t_protein").value) || settings.targets.protein;
  settings.proteinMode = document.getElementById("t_proteinMode").value;
  settings.proteinPerKgLBM = Number(document.getElementById("t_proteinPerKg").value) || settings.proteinPerKgLBM;
  settings.waterTarget = Number(document.getElementById("t_water").value) || settings.waterTarget;
  save();
  alert("Targets saved.");
}

function deleteHistoryDay(i) { if (confirm("Delete this day from history?")) { history.splice(i, 1); save(); renderSettings(); } }

function exportData() {
  let blob = new Blob([JSON.stringify({ templates, foods, today, history, bodyLog, bodyPhotos, water, settings }, null, 2)], { type: "application/json" });
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `diet_backup_${todayStr()}.json`;
  a.click();
}

function importData(input) {
  if (!input.files.length) return;
  let reader = new FileReader();
  reader.onload = function (e) {
    try {
      let data = JSON.parse(e.target.result);
      templates = data.templates || DEFAULT_TEMPLATES;
      foods = data.foods || DEFAULT_FOODS;
      today = data.today || { date: todayStr(), entries: [] };
      history = data.history || [];
      bodyLog = data.bodyLog || [];
      bodyPhotos = data.bodyPhotos || [];
      water = data.water || {};
      settings = Object.assign({ targets: Object.assign({}, DEFAULT_TARGETS), proteinMode: "manual", proteinPerKgLBM: 2, waterTarget: 8, theme: "clinical", bodyPin: "" }, data.settings || {});
      bodyPhotosUnlocked = false;
      save(); applyTheme();
      alert("Backup imported.");
      tab("meals");
    } catch (err) { alert("Invalid backup file."); }
  };
  reader.readAsText(input.files[0]);
}

function clearData() {
  if (confirm("Delete ALL data? This cannot be undone — export a backup first.")) { localStorage.clear(); location.reload(); }
}

/* ============================================================
   Init
   ============================================================ */

applyTheme();
tab("meals");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
