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
let today = load("dt_today", { date: todayStr(), entries: [] });
let history = load("dt_history", []);
let bodyLog = load("dt_bodyLog", []);
let water = load("dt_water", {});
let settings = Object.assign({ targets: Object.assign({}, DEFAULT_TARGETS), proteinMode: "manual", proteinPerKgLBM: 2, waterTarget: 8, theme: "night" }, load("dt_settings", {}));
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

function save() {
  localStorage.setItem("dt_templates", JSON.stringify(templates));
  localStorage.setItem("dt_foods", JSON.stringify(foods));
  localStorage.setItem("dt_today", JSON.stringify(today));
  localStorage.setItem("dt_history", JSON.stringify(history));
  localStorage.setItem("dt_bodyLog", JSON.stringify(bodyLog));
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
  document.body.dataset.theme = settings.theme || "night";
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
    .filter(({ m }) => !mealSearch || m.name.toLowerCase().includes(mealSearch.toLowerCase()));

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
          <div class="spread"><b>${escapeHtml(m.name)}</b><span class="tag">${m.category || "Uncategorized"}</span></div>
          <div class="ingredients">${m.ingredients && m.ingredients.length ? escapeHtml(m.ingredients.join(", ")) : "No ingredients listed"}</div>
          <div class="ingredients">${round1(m.nutrients.cal)} kcal &middot; P ${round1(m.nutrients.protein)}g &middot; C ${round1(m.nutrients.carbs)}g &middot; F ${round1(m.nutrients.fat)}g</div>
        </div>
      </div>
      <div class="row">
        <button onclick="openAddServing(${i})">Add</button>
        <button class="edit small" onclick="openMealForm(${i})">Edit</button>
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
  templates.push(copy); save(); renderMeals();
}

function openMealForm(i) {
  let editing = i !== undefined && i !== null && i >= 0;
  let m = editing ? templates[i] : { name: "", category: "Breakfast", photo: null, ingredients: [], nutrients: emptyNutrients() };

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

        ${macroRows}

        <label class="full">Ingredients (comma separated)</label>
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
  let m = {
    name: document.getElementById("f_name").value.trim() || "Unnamed Meal",
    category: document.getElementById("f_cat").value,
    photo: document.getElementById("f_photo_data").value || null,
    nutrients,
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
  let filtered = foods.map((f, i) => ({ f, i })).filter(({ f }) => !foodSearch || f.name.toLowerCase().includes(foodSearch.toLowerCase()));

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
      <div class="spread"><b>${escapeHtml(f.name)}</b><span class="tag">${f.category || "Other"}</span></div>
      <div class="ingredients">Per 100g: ${round1(f.per100g.cal)} kcal &middot; P ${round1(f.per100g.protein)}g &middot; C ${round1(f.per100g.carbs)}g &middot; F ${round1(f.per100g.fat)}g</div>
      <div class="row">${(f.presets || []).map((p, pi) => `<button class="secondary small" onclick="logFoodPreset(${i},${pi})">${escapeHtml(p.label)}</button>`).join("")}</div>
      <div class="row" style="margin-top:8px">
        <button class="edit small" onclick="openFoodForm(${i})">Edit</button>
        <button class="delete small" onclick="deleteFood(${i})">Delete</button>
      </div>
    </div>`;
  });

  document.getElementById("foods").innerHTML = html;
}

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

function renderNutrition() {
  let t = sumEntries(today.entries);
  let html = `<h2 class="page-title">Nutrition — Today</h2><div class="card">`;

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

  document.getElementById("nutrition").innerHTML = html;

  if (totalMacroCal > 0) {
    new Chart(document.getElementById("macroPie"), {
      type: "doughnut",
      data: { labels: ["Protein", "Carbs", "Fat"], datasets: [{ data: [pCal, cCal, fCal], backgroundColor: ["#3ddc97", "#5b9bf7", "#f5b942"], borderWidth: 0 }] },
      options: { plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue("--text") } } } }
    });
  }
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
   BODY TAB
   ============================================================ */

function renderBody() {
  let latest = bodyLog.length ? bodyLog[bodyLog.length - 1] : { weight: 70, bf: 20 };
  let html = `<h2 class="page-title">Body</h2>
  <div class="card"><h3>Log an entry</h3>
    <label>Weight (kg)</label><input id="bw" type="number" step="0.1" value="${latest.weight}">
    <label>Body fat %</label><input id="bbf" type="number" step="0.1" value="${latest.bf}">
    <button style="margin-top:12px" onclick="saveBodyEntry()">Save entry for today</button>
  </div>`;

  if (bodyLog.length > 1) html += `<div class="card"><h3>Weight trend</h3><canvas id="weightChart" height="160"></canvas></div>`;

  html += `<div class="card"><h3>History</h3>`;
  if (!bodyLog.length) html += `<div class="empty">No entries yet.</div>`;
  else [...bodyLog].reverse().slice(0, 20).forEach(b => html += `<div class="today-item"><div>${b.date}</div><div class="meta">${b.weight}kg &middot; ${b.bf}% BF</div></div>`);
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
  if (existing) { existing.weight = weight; existing.bf = bf; } else bodyLog.push({ date, weight, bf });
  bodyLog.sort((a, b) => a.date.localeCompare(b.date));
  save(); renderBody();
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
    <div class="section-note">Export regularly — all data (including meal photos) lives only in this browser's storage.</div>
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
  let blob = new Blob([JSON.stringify({ templates, foods, today, history, bodyLog, water, settings }, null, 2)], { type: "application/json" });
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
      water = data.water || {};
      settings = Object.assign({ targets: Object.assign({}, DEFAULT_TARGETS), proteinMode: "manual", proteinPerKgLBM: 2, waterTarget: 8, theme: "night" }, data.settings || {});
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
