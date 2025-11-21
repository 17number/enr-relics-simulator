MAX_EFFECT_NUM = 18;
MAX_DISADVANTAGE_NUM = 24;

/* -----------------------
  App code: UI + data loading
------------------------- */

const FILES = [
  "master/normal_relic_effects.json5",
  "master/depth_relic_effects.json5",
  "master/depth_relic_disadvantages.json5",
  "master/chalices.json5",
  "master/relic_names.json5",
  "master/unique_relics.json5",
  "master/characters.json5",
  "master/effect_categories.json5",
  "master/effect_groups.json5",
  "master/demo_relics.json5",
];

let DATA = {};
let effectGroups = [];
let effectMap = {};
let normalEffects= [], depthEffects = [], allEffects = [];
let allRelics = [];
let disadvantages = [], characters = [], chalices = [], relicNames = [], uniqueRelics = [];
let userRelics = [];
let demoRelics = [], demoActiveRelics = [];
let searchCondition = {};
let deleteRelicIds = [];
let isSearching = false;
let isDemoMode = false;
let currentTab = "usageTab";
const expandCache = new Map();
const USER_RELICS_KEY = "my_relics";
const SEARCH_CONDITION = "search_cond";
const ACTIVE_TAB = "active_tab";
const COLOR_MAP = {
  "r": "red",
  "b": "blue",
  "y": "yellow",
  "g": "green",
  "red": "r",
  "blue": "b",
  "yellow": "y",
  "green": "g",
};
const SIZE_MAP = {
  "s": 1,
  "m": 2,
  "l": 3,
};

async function loadAll(){
  const loaded = {};
  for(const f of FILES){
    try{
      const r = await fetch(f);
      const txt = await r.text();
      loaded[f] = JSON5.parse(txt);
    }catch(e){
      console.error("failed to load", f, e);
      loaded[f] = (f.endsWith("chalices.json5")||f.endsWith("unique_relics.json5")||f.endsWith("characters.json5"))? [] : {};
    }
  }
  DATA = loaded;
  const categories = DATA[FILES.at(7)] || [];
  effectGroups = DATA[FILES.at(8)] || [];
  normalEffects = (DATA[FILES.at(0)] || []).map(e => {
    const group = effectGroups.find(g => g.normal_ids.includes(e.id));
    return {
      ...e,
      group_id: group?.id ?? null,
      text2: `[通常] ${e.text}`,
    }
  });
  depthEffects = (DATA[FILES.at(1)] || []).map(e => {
    const group = effectGroups.find(g => g.depth_ids.includes(e.id));
    return {
      ...e,
      group_id: group?.id ?? null,
      text2: `[深層] ${e.text}`,
    }
  });
  allEffects = [...normalEffects, ...depthEffects];
  effectMap = {};
  // normal & depth categories: objects keyed by category name -> arrays
  for(const eff of allEffects){
    eff.category = categories.find(cat=>cat.id === eff.category_id);
    effectMap[eff.id] = eff;
  }
  // load other files
  disadvantages = DATA[FILES.at(2)] || [];
  chalices = DATA[FILES.at(3)] || [];
  relicNames = DATA[FILES.at(4)] || [];
  uniqueRelics = DATA[FILES.at(5)] || [];
  allRelics = [...uniqueRelics, ...relicNames];
  characters = DATA[FILES.at(6)] || [];
  demoRelics = DATA[FILES.at(9)] || [];

  // load user relics from localStorage
  userRelics = loadUserRelics();
  userRelics = buildUserRelicsForRender(userRelics);
  demoRelics = buildUserRelicsForRender(demoRelics);

  // load user search condition
  loadSearchCondition();
}

function buildUserRelicsForRender(relics) {
  return relics.map(r => {
    if (r._effects && r._disadvantages) {
      return r;
    }

    const relicObj = allRelics.find(_r => _r.id === r.relic_id);
    const _effects = r.effects.map(eid => {
      const effectObj = allEffects.find(_e => _e.id === eid);
      if (!effectObj) return {id: eid};
      return {
        id: eid,
        text: effectObj.text,
        kana: effectObj.kana,
      };
    });
    const _disadvantages = r.disadvantages.map(did => {
      const disadvandageObj = disadvantages.find(_d => _d.id === did);
      if (!disadvandageObj) return {id: did};
      return {
        id: did,
        text: disadvandageObj.text,
        kana: disadvandageObj.kana,
      };
    });
    return {
      id: r.id,
      relic_id: r.relic_id ?? relicObj.id,
      name: relicObj.name,
      color: r.color ?? COLOR_MAP[relicObj.color],
      type: relicObj.type,
      unique: relicObj.unique,
      effects: r.effects,
      _effects,
      disadvantages: r.disadvantages,
      _disadvantages,
    };
  });
}

function renderWithData() {
  renderCharacters();
  renderRelics();
  initDesiredArea();
  initExcludedArea();
}

/**
 * キャラクター選択欄
 */
function renderCharacters() {
  const list = document.getElementById("characterList");
  list.innerHTML = "";

  const initialId = searchCondition.character_id || characters[0].id;
  characters.forEach((c, idx) => {
    const label = document.createElement("label");
    label.className = "character-card";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "character";
    input.value = c.id;
    if (c.id === initialId) {
      input.checked = true;
      label.classList.add('active');
    }
    input.addEventListener("change", onCharacterChange);

    const name = document.createElement("div");
    name.className = "character-name";
    name.textContent = c.name;

    label.appendChild(input);
    label.appendChild(name);
    list.appendChild(label);
  });

  // 初期選択
  if (characters.length > 0) {
    const initialInput = list.querySelector(`input[value="${initialId}"]`);
    if (initialInput) {
      initialInput.checked = true;
    }
  }
}

/**
 * キャラクター変更時
 */
function onCharacterChange() {
  const selected = document.querySelector('input[name="character"]:checked');
  if (!selected) {
    return;
  }
  document.querySelectorAll('input[name="character"]').forEach(e => {
    e.closest('.character-card').classList.remove('active');
  });
  selected.closest('.character-card').classList.add('active');

  const id = Number(selected.value);
  const char = characters.find(c=>c.id===id);
  if (id !== searchCondition.character_id) {
    // キャラ変更時はそのキャラで前に設定していた効果やデメリットなどを復元
    searchCondition.character_id = id;
    renderDesiredRows(true);
    renderExcludedRows(true);

    gtag('event', 'change_character', {
      event_category: 'ui_action',
      event_label: 'Character Change',
      character_id: id,
      character_name: char?.name,
    });
  }
  updateSearchCondition();
  saveSearchCondition();
}

function updateSearchCondition() {
  const selected = document.querySelector('input[name="character"]:checked');
  if (!selected) return;
  const character_id = Number(selected.value);
  const desiredSelects = Array.from(document.querySelectorAll("select[id^='desired_select_']"));
  const desiredCounts = Array.from(document.querySelectorAll("select[id^='desired_count_']"));
  const excludedSelects = Array.from(document.querySelectorAll("select[id^='excluded_select_']"));
  const effect_ids = desiredSelects.map(s => Number(s.value.trim() || 0));
  const effect_counts = desiredCounts.map(s => Number(s.value.trim() || 1));
  const disadvantage_ids = excludedSelects.map(s => Number(s.value.trim() || 0));
  searchCondition = {
    ...searchCondition,
    character_id,
    [character_id]: {
      effect_ids,
      effect_counts,
      disadvantage_ids,
    },
  }
}

/**
 * localStorage の保存データ読み込み
 */
function loadSearchCondition(){
  const raw = localStorage.getItem(SEARCH_CONDITION);
  if (raw) {
    searchCondition = JSON.parse(raw);
  } else {
    searchCondition = {
      character_id: 1,
    };
    characters.forEach(char => searchCondition[char.id] = {
      effect_ids: [0],
      effect_counts: [1],
      disadvantage_ids: [],
    });
  }
  return searchCondition;
}

/**
 * localStorage に保存
 */
function saveSearchCondition(){
  localStorage.setItem(
    SEARCH_CONDITION,
    JSON.stringify(searchCondition),
  );
}

/**
 * localStorage の保存データ読み込み
 */
function loadUserRelics(){
  const raw = localStorage.getItem(USER_RELICS_KEY);
  userRelics = raw ? JSON.parse(raw) : [];
  return userRelics;
}

/**
 * localStorage に保存
 */
function saveUserRelics(){
  localStorage.setItem(
    USER_RELICS_KEY,
    JSON.stringify(
      (userRelics||[])
        .map(r => ({
          id: r.id,
          color: r.color,
          relic_id: r.relic_id,
          effects: r.effects,
          disadvantages: r.disadvantages,
        }))
    ),
  );
}

/**
 * テキストの近いものを取得
 */
function findClosest(text, list, key) {
  const fuse = new Fuse(list, { keys: [key], threshold: 0.3 });
  try {
    const res = fuse.search(text);
    return res.length > 0 ? res[0].item : null;
  } catch (e) {
    console.error(e)
  }
}

/**
 * テキストで遺物効果などを検索
 */
function findByText(text, list, key = "text") {
  const exact = list.find(item => item[key] === text);
  if (exact) return exact;
  return findClosest(text, list, key);
}

/**
 * CSV 取り込み
 */
async function importCSV(file, mode) {
  const csvText = await file.text();
  const parsed = Papa.parse(csvText, { header: true }).data;

  const imported = [];

  for (const row of parsed) {
    if (!row.Name) continue;

    const relicObj = findByText(row.Name, allRelics, "name");
    const color = row.Color ? row.Color[0].toLowerCase() : "";

    const _effects = [];
    const _disadvantages = [];

    const candEffects = relicObj.type === "normal" ? normalEffects : depthEffects;
    const candDisadvantages = relicObj.type === "normal" ? [] : disadvantages;

    for (let i = 1; i <= 3; i++) {
      const e = row[`Effect${i}`]?.trim();
      if (!e) {
        _effects.push(0);
      } else {
        const match = findByText(e, candEffects);
        if (match) _effects.push(match.id);
        else _effects.push(0);
      }

      const d = row[`Disadvantage${i}`]?.trim();
      if (!d) {
        _disadvantages.push(0);
      } else {
        const match = findByText(d, candDisadvantages);
        if (match) _disadvantages.push(match.id);
        else _disadvantages.push(0);
      }
    }

    imported.push({
      id: ULID.ulid(),
      relic_id: relicObj?.id ?? null,
      color,
      effects: _effects,
      disadvantages: _disadvantages,
    });
  }

  // --- localStorage 保存処理 ---
  if (mode === "overwrite") {
    userRelics = imported;
  } else {
    const existingRelics = userRelics.map(r => ({
      id: r.id,
      relic_id: r.relic_id,
      color: r.color[0],
      effects: r.effects.map(e => e?.id ?? 0),
      disadvantages: r._disadvantages.map(d => d?.id ?? 0),
    }));
    if (mode === "append-start") {
      userRelics = [
        ...imported,
        ...existingRelics,
      ]
    }
    else {
      userRelics = [
        ...existingRelics,
        ...imported,
      ]
    }
  }

  saveUserRelics();
  userRelics = buildUserRelicsForRender(userRelics);
  renderRelics();

  gtag('event', 'import_csv', {
    event_category: 'ui_action',
    event_label: 'Import CSV',
    mode,
    existing_count: userRelics.length - imported.length,
    imported_count: imported.length,
    total_count: userRelics.length,
  });

  clearImportCsvFile();
  closeRelicModal();

  if (isDemoMode) {
    toggleDemoMode(false);
  }
}

document.querySelectorAll(`[id*="importCsv"]`)
  .forEach(btn =>
    btn.addEventListener("click", async (event) => {
      const fileInput = document.getElementById("relicsCsv");
      const file = fileInput.files[0];
      if (!file) return alert("CSVファイルを選択してください。");

      const mode = event.target.dataset.importMode;
      await importCSV(file, mode);
    }));

/* -----------------------
  Desired effects area (dynamic rows with incremental search)
------------------------- */
let desiredRowIndex = 0;
let excludedRowIndex = 0;

/**
 * 探索対象遺物効果の初期化
 */
function initDesiredArea(){
  const container = document.getElementById("desiredList");
  container.innerHTML = "";
  document.querySelectorAll("#addDesiredBtn").forEach(e => e.addEventListener("click", () => {
    addDesiredRow();
    updateSearchCondition();
    saveSearchCondition();
  }));
  document.querySelectorAll("#resetDesiredBtn").forEach(e => e.addEventListener("click", ()=> {
    container.innerHTML = "";
    addDesiredRow();
    updateSearchCondition();
    saveSearchCondition();
  }));

  // 前回の設定を復元
  renderDesiredRows();
}

function resetEffectNumbers() {
  const container = document.getElementById("desiredList");
  Array.from(container.children).forEach((e, i) => {
    e.querySelector("span[id^='desired_number_']").textContent = i + 1;
  });
}

/**
 * 探索対象遺物効果の追加
 */
function addDesiredRow(){
  const container = document.getElementById("desiredList");
  if (container.children.length >= MAX_EFFECT_NUM) {
    return;
  }

  const idx = desiredRowIndex++;
  const wrapper = document.createElement("div");
  wrapper.className = "effect-row";
  wrapper.style.position = "relative";
  wrapper.id = "desired_row_"+idx;
  wrapper.innerHTML = `
    <span id="desired_number_${idx}" class="small" style="width: 0.9rem;">${container.children.length + 1}</span>
    <select id="desired_select_${idx}" placeholder="効果を選択(名前/かな 入力で候補表示)" style="flex:1" data-idx="${idx}"></select>
    <select id="desired_count_${idx}" title="個数">
      ${[1,2,3].map(n=>`<option value="${n}">x${n}</option>`).join('')}
    </select>
    <button class="btn-secondary" id="desired_remove_${idx}">削除</button>
    <button class="btn-secondary" id="desired_upto_${idx}">↑</button>
    <button class="btn-secondary" id="desired_downto_${idx}">↓</button>
  `;
  container.appendChild(wrapper);
  new TomSelect(`select#desired_select_${idx}`, {
    options: allEffects,
    valueField: 'id',
    labelField: 'text2',
    searchField: ['text', 'kana'],
    maxItems: 1,
    maxOptions: null,
    plugins: ['remove_button'],
    create: false,
    placeholder: '効果を選択(名前/かな 入力で候補表示)',
    onChange: (value) => {
      updateSearchCondition();
      saveSearchCondition();
    },
  });

  wrapper.querySelector("#desired_count_"+idx).addEventListener("change", ()=> {
    updateSearchCondition();
    saveSearchCondition();
  });
  wrapper.querySelector("#desired_upto_"+idx).addEventListener("click", ()=> {
    const children = container.children;
    const index = Array.from(children).findIndex(e => e.id === wrapper.id);
    if (index === 0) return;
    container.insertBefore(children[index], children[index - 1]);
    resetEffectNumbers();
    updateSearchCondition();
    saveSearchCondition();
  });
  wrapper.querySelector("#desired_downto_"+idx).addEventListener("click", ()=> {
    const children = container.children;
    const index = Array.from(children).findIndex(e => e.id === wrapper.id);
    if (index === children.length - 1) return;
    container.insertBefore(children[index], children[index + 1].nextSibling);
    resetEffectNumbers();
    updateSearchCondition();
    saveSearchCondition();
  });
  wrapper.querySelector("#desired_remove_"+idx).addEventListener("click", ()=> {
    wrapper.remove();
    resetEffectNumbers();
    updateSearchCondition();
    saveSearchCondition();
  });
}

function renderDesiredRows(clear = false) {
  if (clear) {
    const container = document.getElementById("desiredList");
    container.innerHTML = "";
  }

  const cond = searchCondition[searchCondition.character_id] || {
      effect_ids: [0],
      effect_counts: [1],
      disadvantage_ids: [],
  };
  if (cond.effect_ids.length === 0) {
    addDesiredRow();
    return;
  }

  for (let i = 0; i < cond.effect_ids.length; i++) {
    addDesiredRow();

    const row = document.getElementById("desiredList").lastElementChild;

    const effectId = cond.effect_ids[i] ?? 0;
    if (effectId) {
      const selectDesired = row.querySelector("select[id^='desired_select_']");
      selectDesired.tomselect.setValue(effectId.toString(), true);
    }

    const count = cond.effect_counts[i] ?? 1;
    if (count > 1) {
      const selectCount = row.querySelector("select[id^='desired_count_']");
      selectCount.value = count;
    }
  }
}

/**
 * 探索対象遺物効果の初期化
 */
function initExcludedArea(){
  const container = document.getElementById("excludedList");
  container.innerHTML = "";
  document.querySelectorAll("#addExcludedBtn").forEach(e => e.addEventListener("click", () => {
    addExcludedRow();
    updateSearchCondition();
    saveSearchCondition();
  }));
  document.querySelectorAll("#resetExcludedBtn").forEach(e => e.addEventListener("click", () => {
    container.innerHTML = "";
    updateSearchCondition();
    saveSearchCondition();
  }));

  // 前回の設定を復元
  renderExcludedRows();
}

/**
 * 探索対象外デメリット効果の追加
 */
function addExcludedRow(){
  const container = document.getElementById("excludedList");
  if (container.children.length >= MAX_DISADVANTAGE_NUM) {
    return;
  }

  const idx = excludedRowIndex++;
  const wrapper = document.createElement("div");
  wrapper.className = "disadvantage-row";
  wrapper.style.position = "relative";
  wrapper.id = "excluded_row_"+idx;
  wrapper.innerHTML = `
    <select id="excluded_select_${idx}" placeholder="デメリットを選択(名前/かな 入力で候補表示)" style="flex:1" data-idx="${idx}"></select>
    <button class="btn-secondary" id="excluded_remove_${idx}">削除</button>
  `;
  container.appendChild(wrapper);
  new TomSelect(`select#excluded_select_${idx}`, {
    options: disadvantages,
    valueField: 'id',
    labelField: 'text',
    searchField: ['text', 'kana'],
    maxItems: 1,
    maxOptions: null,
    plugins: ['remove_button'],
    create: false,
    placeholder: 'デメリットを選択(名前/かな 入力で候補表示)',
    onChange: (value) => {
      updateSearchCondition();
      saveSearchCondition();
    },
  });

  wrapper.querySelector("#excluded_remove_"+idx).addEventListener("click", ()=> {
    wrapper.remove();
    updateSearchCondition();
    saveSearchCondition();
  });
}

function renderExcludedRows(clear = false) {
  if (clear) {
    const container = document.getElementById("excludedList");
    container.innerHTML = "";
  }

  const cond = searchCondition[searchCondition.character_id] || {
      effect_ids: [0],
      effect_counts: [1],
      disadvantage_ids: [],
  };
  if (cond.disadvantage_ids.length === 0) {
    return;
  }

  for (let i = 0; i < cond.disadvantage_ids.length; i++) {
    addExcludedRow();

    const row = document.getElementById("excludedList").lastElementChild;

    const disadvantageId = cond.disadvantage_ids[i] ?? 0;
    if (disadvantageId) {
      const selectExcluded = row.querySelector("select[id^='excluded_select_']");
      selectExcluded.tomselect.setValue(disadvantageId.toString(), true);
    }
  }
}

/* -----------------------
  Inventory (user relics) management
------------------------- */
let virtualScroller = null;

function normalizeFullwidth(str) {
  return str.replace(/[A-Za-z0-9!-/:-@[-`{-~]/g, s =>
    String.fromCharCode(s.charCodeAt(0) + 0xFEE0)
  );
}

function filterRelics(relics) {
  const q = (document.getElementById("inventorySearch").value || "").toLowerCase().trim();
  let filtered = relics;
  q.split(/\s/).forEach(_q => {
    filtered = filtered.filter(r=>{
      if(!r) return false;
      if(_q==="") return true;
      // ID
      if(_q.length === 26 && (r.id||"").toLowerCase().includes(_q)) return true;
      // 名前
      if((r.name||"").toLowerCase().includes(_q)) return true;
      // 効果
      const _Q = normalizeFullwidth(_q);
      if((r._effects||[]).some(e=>{
        return (
          (e?.text||"").toLowerCase().includes(_Q) ||
          (e?.kana||"").toLowerCase().includes(_Q)
        );
      })) return true;
      // デメリット
      if((r._disadvantages||[]).some(d=>{
        return (
          (d?.text||"").toLowerCase().includes(_Q) ||
          (d?.kana||"").toLowerCase().includes(_Q)
        );
      })) return true;
      // 色
      const color = (r.color.at(0) ?? "").toLowerCase();
      if(["r","g","b","y"].includes(_q) && color == _q) return true;
      // 大きさ
      const size = r._effects.filter(e => e?.id).length;
      if(["s","m","l"].includes(_q) && SIZE_MAP[_q] === size) return true;
      // 遺物種類
      const type = r.type.at(0) ?? "";
      if(["n","d"].includes(_q) && type === _q) return true;

      return false;
    });
  });
  return filtered;
}

function createRelicDiv(relic) {
  const relics = isDemoMode ? demoActiveRelics : userRelics;
  const div = document.createElement("div");
  const colorFirstLetter = relic.color ? relic.color[0] : "grey";
  div.classList.add("relic-item", `bg-${colorFirstLetter}`);
  const colorClass = `color-${colorFirstLetter}`;
  const checked = deleteRelicIds.includes(relic.id) ? "checked" : "";
  const deleteCheckbox = relic.unique ? "" : `<label style="cursor: pointer"><input type="checkbox" id="delete-${relic.id}" data-id="${relic.id}" ${checked} style="cursor: pointer">削除</label>`;
  const effectsAndDisadvantages = [];
  for (let i = 0; i < 3; i++) {
    const effect = relic._effects[i];
    const disadvantage = relic._disadvantages[i];
    if (!effect?.id) {
      break;
    }
    effectsAndDisadvantages.push({
      effect: effect.text,
      disadvantage: disadvantage?.text || "",
    });
  }
  const effectList = effectsAndDisadvantages
    .map(e =>
      `
        <li>
          <span class="effect">
            ${e.effect}
          </span>
          <span class="disadvantage">
            ${e.disadvantage ? "<br>" + e.disadvantage : ""}
          </span>
        </li>
      `
    )
    .join("")
  div.innerHTML = `
    <div style="flex:1">
      <div>
        <span class="color-chip ${colorClass}"></span>
        <strong>${isDemoMode ? "[デモ] " : ""}${relic.name}</strong>
        <span class="tiny">(${relics.indexOf(relic) + 1}: ${relic.id})</span>
      </div>
      <div class="small muted">
        <ul class="effect-list">
          ${effectList}
        </ul>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${deleteCheckbox}
    </div>
  `;

  // カラーチップクリックで検索エリアに反映
  div.querySelector(".color-chip").addEventListener("click", () => {
    const color = relic.color ? relic.color[0].toLowerCase() : "";
    const searchInput = document.getElementById("inventorySearch");
    if (searchInput.value.includes(color)) {
      return;
    }
    if (searchInput.value.trim() !== "") {
      searchInput.value += " ";
    }
    searchInput.value += color;
    searchInput.dispatchEvent(new Event("input"));
  });

  // 効果/デメリット クリックで検索エリアに反映
  div.querySelectorAll(".effect, .disadvantage").forEach(elem => {
    elem.addEventListener("click", () => {
      const text = elem.textContent.trim();
      const searchInput = document.getElementById("inventorySearch");
      if (searchInput.value.includes(text)) {
        return;
      }
      if (searchInput.value.trim() !== "") {
        searchInput.value += " ";
      }
      searchInput.value += text;
      searchInput.dispatchEvent(new Event("input"));
    });
  });

  // 削除チェックボックス
  div.querySelector(`input[type="checkbox"]`)?.addEventListener("change", onChangeRelicDeleteCheckbox);

  return div;
}

async function onChangeRelicDeleteCheckbox(event) {
  const id = event.target.dataset.id;
  const checked = event.target.checked;
  if (checked) {
    deleteRelicIds = Array.from(new Set([...deleteRelicIds, id]));
  } else {
    deleteRelicIds = deleteRelicIds.filter(v => v !== id);
  }

  const deleteButtton = document.getElementById("deleteRelics");
  if (deleteRelicIds.length) {
    deleteButtton.removeAttribute("disabled");
  } else {
    deleteButtton.setAttribute("disabled", "disabled");
  }
}

function exportDeletedRelicsCSV(relics) {
  if (relics.length === 0) {
    return;
  }

  const rows = [
    [
      "No.",
      "Name",
      "Color",
      "Effect1",
      "Effect2",
      "Effect3",
      "Disadvantage1",
      "Disadvantage2",
      "Disadvantage3",
    ]
  ];
  relics.forEach((r, i) => {
    rows.push([
      i + 1,  // No.
      r.name,  // Name
      COLOR_MAP[r.color],  // Color
      r._effects.at(0)?.text || "",  // Effect1
      r._effects.at(1)?.text || "",  // Effect2
      r._effects.at(2)?.text || "",  // Effect3
      r._disadvantages.at(0)?.text || "",  // Disadvantage1
      r._disadvantages.at(1)?.text || "",  // Disadvantage2
      r._disadvantages.at(2)?.text || "",  // Disadvantage3
    ]);
  });

  const csv = Papa.unparse(rows);

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = dayjs();
  a.download = `deleted_relics_${now.format("YYYYMMDD_HHmmss")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function onClickRelicsDeleteButton() {
  if (deleteRelicIds.length === 0) return;

  const isConfirmed = await showConfirmDialog("確認", `チェックした遺物(${deleteRelicIds.length}件)を削除しますか？`);
  if (!isConfirmed) {
    return;
  }

  if (isDemoMode) {
    demoActiveRelics = demoActiveRelics.filter(x => !deleteRelicIds.includes(x.id));
  } else {
    const deleteRelics = userRelics.filter(x => deleteRelicIds.includes(x.id));
    userRelics = userRelics.filter(x => !deleteRelicIds.includes(x.id));
    saveUserRelics();

    // 削除した遺物情報をCSV出力
    exportDeletedRelicsCSV(deleteRelics);
  }
  deleteRelicIds = [];
  document.getElementById("deleteRelics").setAttribute("disabled", "disabled");

  renderRelics();

  gtag('event', 'delete_relics', {
    event_category: 'ui_action',
    event_label: 'Delete Relics',
    isDemoMode,
    delete_count: deleteRelicIds.length,
  });
}
document.getElementById("deleteRelics").addEventListener("click", onClickRelicsDeleteButton);

function renderRelicCounts(filteredCount) {
  const filteredCountElem = document.getElementById("filteredRelicsCount");
  const totalCountElem = document.getElementById("totalRelicsCount");
  totalCountElem.textContent = isDemoMode ? demoActiveRelics.length : userRelics.length;
  filteredCountElem.textContent = filteredCount;
}

function initializeOrRefreshVirtualScroller(relics = [], filtered = []) {
  if (currentTab !== "inventoryTab") {
    return;
  }

  if (!virtualScroller) {
    const list = document.getElementById("inventoryList");
    virtualScroller = new VirtualScroller(
      list,
      relics,
      createRelicDiv
    )
  } else {
    virtualScroller.setItems(filtered);
  }
}

function renderRelics(){
  const list = document.getElementById("inventoryList");
  list.innerHTML = "";
  const relics = isDemoMode ? demoActiveRelics : userRelics;
  if (relics.length === 0) {
    list.textContent = "(登録遺物0件)";
    return;
  }
  // allow search
  const filtered = filterRelics(relics);
  renderRelicCounts(filtered.length);
  if (filtered.length===0) {
    list.textContent = "(該当なし)";
    return;
  }

  initializeOrRefreshVirtualScroller(relics, filtered);
}
document.getElementById("inventorySearch").addEventListener("input", renderRelics);

/* -----------------------
  Add relic modal handling
------------------------- */
document.getElementById("openAddRelic").addEventListener("click", ()=>{
  showImportRelicsModal();
});
function showImportRelicsModal(){
  const modal = document.getElementById("importRelicsModal");
  modal.style.display = "flex";
}
function clearImportCsvFile() {
  const fileInput = document.getElementById("relicsCsv");
  fileInput.value = "";
}
function closeRelicModal() {
  document.getElementById("importRelicsModal").style.display = "none";
}
document.querySelectorAll("#importRelicsModal, #r_cancel").forEach(e => e.addEventListener("click", (e)=> {
  if (!["importRelicsModal", "r_cancel"].includes(e.target.id)) return;
  closeRelicModal();
}));

/* -----------------------
  Output CSV
------------------------- */
document.getElementById("exportCsv").addEventListener("click", ()=>{
  exportRelicsCSV();
});
function exportRelicsCSV(){
  if (userRelics.length === 0) {
    return;
  }

  const rows = [
    [
      "No.",
      "Name",
      "Color",
      "Effect1",
      "Effect2",
      "Effect3",
      "Disadvantage1",
      "Disadvantage2",
      "Disadvantage3",
    ]
  ];
  userRelics.forEach((r, i) => {
    rows.push([
      i + 1,  // No.
      r.name,  // Name
      COLOR_MAP[r.color],  // Color
      r._effects.at(0)?.text || "",  // Effect1
      r._effects.at(1)?.text || "",  // Effect2
      r._effects.at(2)?.text || "",  // Effect3
      r._disadvantages.at(0)?.text || "",  // Disadvantage1
      r._disadvantages.at(1)?.text || "",  // Disadvantage2
      r._disadvantages.at(2)?.text || "",  // Disadvantage3
    ]);
  });

  const csv = Papa.unparse(rows);

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = dayjs();
  a.download = `relics_${now.format("YYYYMMDD_HHmmss")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  gtag('event', 'export_relics_csv', {
    event_category: 'ui_action',
    event_label: 'Export Relics CSV',
    total_count: userRelics.length,
  });
}

/* -----------------------
  Search (探索) action
------------------------- */
const searchWorker = new Worker(`searchWorker.js?${Date.now()}`);
searchWorker.onmessage = function(e) {
  const data = e.data;

  if (data.progress) {
    renderProgress(data.progress)
  } else if (data.success) {
    const statusArea = document.getElementById("statusArea");
    const m = Math.floor(data.elapsed / 1000 / 60);
    const s = (data.elapsed / 1000 % 60).toFixed(3);
    const t = m > 0 ? `${m}分${s}秒` : `${s}秒`;
    statusArea.textContent = `探索完了: 所要時間 ${t}。結果はあくまで目安です。ビルド構築の参考にしてみてください。`;
    renderResults(data.results, data.desired);
    playCompletionSound();

    toggleSearching();

    gtag('event', 'complete_search', {
      event_category: 'ui_action',
      event_label: 'Complete Search',
      isDemoMode,
      character_id: searchCondition.character_id,
      character_name: characters.find(c=>c.id===searchCondition.character_id)?.name,
      elapsed: data.elapsed,
    });
  } else {
    console.error(data.error);
    playErrorBeep();
    alert("探索中にエラーが発生しました: " + data.error);

    toggleSearching();
  }
};

function toggleSearching() {
  isSearching = !isSearching;
  document.querySelectorAll("#searchBtn, #clearResultsBtn")
    .forEach(btn => {
      if (isSearching) btn.setAttribute("disabled", "disabled");
      else btn.removeAttribute("disabled");
    })
}

function playCompletionSound() {
  const synth = new Tone.Synth().toDestination();
  const now = Tone.now();
  ["C5", "D5", "E5", "G5", "C6"].forEach((note, i) => {
    synth.triggerAttackRelease(note, "16n", now + i * 0.15);
  });
}

function playErrorBeep() {
  const synth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.4 }
  }).toDestination();

  const now = Tone.now();
  const notes = ["A4", "G4", "E4", "C4"]; // 少し暗めの下降進行
  const interval = 0.2; // 4音×0.2s ≒ 0.8s（完了音と同長）

  notes.forEach((note, i) => {
    synth.triggerAttackRelease(note, "16n", now + i * interval);
  });
}

document.getElementById("searchBtn").addEventListener("click", async ()=>{
  if (isSearching) return;

  try{
    const selected = document.querySelector('input[name="character"]:checked');
    if (!selected) return;
    const charId = Number(selected.value);

    // collect desired effects from rows
    const desiredRows = Array.from(document.querySelectorAll("#desiredList .effect-row"));
    const desired = [];
    for(const r of desiredRows){
      const selectDesired = r.querySelector("select[id^='desired_select_']");
      const selectCount = r.querySelector("select[id^='desired_count_']");
      if(!selectDesired) continue;
      const effId = Number(selectDesired.value.trim() || 0);
      if(!effId) continue;
      const effect = allEffects.find(e=> e.id === effId);
      if(!effect) {
        return;
      }
      const count = Number(selectCount.value || 1);
      for(let i=0;i<count;i++) desired.push(effect.id);
    }
    if(desired.length===0){ alert("欲しい遺物効果を1つ以上選んでください"); return; }
    if(desired.length>MAX_EFFECT_NUM){ alert(`欲しい効果は最大${MAX_EFFECT_NUM}個までです`); return; }

    const excludedRows = Array.from(document.querySelectorAll("#excludedList .disadvantage-row"));
    const excluded = [];
    for(const r of excludedRows){
      const selectDisadvantage = r.querySelector("select[id^='excluded_select_']");
      if(!selectDisadvantage) continue;
      const disId = Number(selectDisadvantage.value.trim() || 0);
      if(!disId) continue;
      const disadvantage = disadvantages.find(d=> d.id === disId);
      if(!disadvantage) {
        return;
      }
      excluded.push(disadvantage.id);
    }
    if(excluded.length>MAX_DISADVANTAGE_NUM){ alert(`除外デメリット効果は最大${MAX_DISADVANTAGE_NUM}個までです`); return; }

    // also we might want to include all unique relics as available even if user hasn't acquired them? the UI checkbox 'includeUnique' controls whether unique relics are used as pool.
    // prepare effectMap param for search
    const relics = isDemoMode ? demoActiveRelics : userRelics;
    let relicPool = relics.filter(r =>
      r._effects.some(e => desired.includes(e?.id))
    );
    if (excluded.length) {
      // デメリット効果で絞り込み
      relicPool = relicPool.filter(r =>
        r._disadvantages.map(d => d?.id).every(did => !excluded.includes(did))
      );
    }

    // invoke search
    document.getElementById("resultsArea").textContent = `探索中...`;
    await new Promise(r=>setTimeout(r,50));

    const char = characters.find(c=>c.id===charId);
    if(!char) throw new Error("character not found");
    const usableChalices = chalices.filter(ch=> (char.chalice_ids||[]).includes(ch.id));
    const _effectMap = {};
    Object.entries(effectMap).forEach(([key, value]) => {
      _effectMap[key] = {
        id: value?.id,
        group_id: value?.group_id ?? null,
        normal_id: value?.normal_id,
        depth_id: value?.depth_id,
        prefer_left: value?.prefer_left,
        level: value?.level ?? false,
        stack: value?.stack ?? false,
        disadvantage: value?.disadvantage ?? false,
      };
    });
    searchWorker.postMessage({
      startUnix: dayjs().valueOf(),
      chalices: usableChalices,
      relicPool,
      effectGroups,
      effectMap: _effectMap,
      desired,
      maxResults: 10,
    });

    gtag('event', 'start_search', {
      event_category: 'ui_action',
      event_label: 'Start Search',
      isDemoMode,
      character_id: searchCondition.character_id,
      character_name: characters.find(c=>c.id===searchCondition.character_id)?.name,
    });

    toggleSearching();
  }catch(e){
    console.error(e);
    alert("探索中にエラーが発生しました: " + e.message);
  }
});

function renderProgress(progress) {
  const { chalices, chaliceIdx, slotIdx, foundResults, currentHighestReusults, desired, elapsed } = progress;
  const statusArea = document.getElementById("statusArea");
  const m = Math.floor(elapsed / 1000 / 60);
  const s = (elapsed / 1000 % 60).toFixed(3);
  const t = m > 0 ? `${m}分${s}秒` : `${s}秒`;
  statusArea.textContent =
    `探索中: 献器(${chalices[chaliceIdx].name}) ${chaliceIdx+1} / ${chalices.length}, スロット ${Math.min(slotIdx+1, 6)} / 6, 見つかった結果 ${foundResults}, 経過時間: ${t}`;
  if (currentHighestReusults.length) {
    renderResults(currentHighestReusults, desired);
  }
}

function renderResults(results, desired) {
  const area = document.getElementById("resultsArea");
  area.innerHTML = "";
  if(!results || results.length===0){
    area.textContent = "該当する組み合わせが見つかりませんでした。条件を見直してください。";
    return;
  }

  // sort already by score
  results.forEach((r, idx)=>{
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>#${idx+1} ${r.chaliceName}</strong></div>
        <div><strong>${(r.score*100).toFixed(0)}%</strong> <span class="muted small">(${r.matched}/${r.desiredTotal})</span></div>
      </div>`;
    // show slots with color chips and relic names + effects
    const slotsDiv = document.createElement("div");
    slotsDiv.style.marginTop = "8px";
    const grid = document.createElement("div");
    grid.className = "grid-3";
    r.combo.forEach((slot,i)=>{
      const s = document.createElement("div");
      const slotColor = r.chaliceColors[i];
      s.classList.add(slotColor === "*" ? `bg-w` : `bg-${slotColor}`);
      s.style.border = "1px solid #ddd";
      s.style.padding = "6px";
      s.style.borderRadius = "6px";
      let colorClass = `color-${slotColor}`;
      if(!slot?.id){
        s.innerHTML = `
          <div class="muted small">スロット ${i+1}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="color-chip ${colorClass}"></span>
            <span>(空)</span>
          </div>
        `;
      } else {
        colorClass = `color-${slot.color[0]}`;
        let effectList = ``;
        for(let i=0;i<3;i++){
          const effect = (slot._effects || []).at(i);
          if (!effect?.id) break;

          const advantageClass = desired.includes(effect.id) ? `advantage desired` : `advantage`;
          const disadvantage = (slot._disadvantages || []).at(i);
          let spanDisadvantage = ``;
          if (disadvantage) {
              spanDisadvantage = `
                <span class="disadvantage" data-disadvantage-id="${disadvantage.id}">
                  ${disadvantage?.text ? "<br>" + disadvantage.text : ""}
                </span>
              `
          }
          effectList += `
            <li>
              <span class="${advantageClass}" data-effect-id="${effect.id}">${effect.text}</span>
              ${spanDisadvantage}
            </li>
          `
        }
        s.innerHTML = `
          <div class="muted small">スロット ${i+1}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="color-chip ${colorClass}"></span>
            <strong data-relic-id="${slot.id}">${isDemoMode ? "[デモ] " : ""}${slot.name ?? ""}</strong>
            <span class="tiny">(${slot.id})</span>
          </div>
          <div class="small muted" style="margin-top:6px">
            <ul class="effect-list">
              ${effectList}
            </ul>
          </div>
        `;
      }
      grid.appendChild(s);
    });
    slotsDiv.appendChild(grid);
    card.appendChild(slotsDiv);
    area.appendChild(card);
  });
}

document.getElementById("clearResultsBtn").addEventListener("click", ()=> {
  if (isSearching) return;
  document.getElementById("resultsArea").textContent = "結果をクリアしました";
});

/* --- タブ切り替え処理 --- */
/**
 * localStorage の保存データ読み込み
 */
function loadActiveTab(){
  return localStorage.getItem(ACTIVE_TAB) ?? "usageTab";
}

/**
 * localStorage の保存データ読み込み
 */
function saveActiveTab(tab) {
  localStorage.setItem(
    ACTIVE_TAB,
    tab,
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  tabButtons.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      tabButtons.forEach(b=>b.classList.remove("active"));
      tabContents.forEach(c=>c.classList.remove("active"));
      btn.classList.add("active");
      const nextTab = btn.dataset.tab;
      currentTab = nextTab;
      saveActiveTab(nextTab);
      document.getElementById(nextTab).classList.add("active");

      renderRelics();
    });
  });

  currentTab = loadActiveTab();
  document.querySelector(`.tab-header .tab-btn[data-tab="${currentTab}"]`).click();
});

// Google Analytics
let gtag = () => {};
function insertScriptForGA() {
  if (isOptOutGA()) return;

  window.dataLayer = window.dataLayer || [];
  gtag = function(){dataLayer.push(arguments);};

  // スクリプト読み込み完了後に初期化
  const script = document.createElement("script");
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-EKKVGVS0YV";
  script.async = true;
  script.onload = () => {
    gtag('js', new Date());
    gtag('config', 'G-EKKVGVS0YV', { anonymize_ip: true });
  };
  document.head.appendChild(script);
}
insertScriptForGA();

function isOptOutGA(){
  const url = new URL(location.href);
  const isNotProduction = (
    url.hostname !== "17number.github.io" ||
    !url.pathname.startsWith("/enr-relics-simulator")
  );
  return isNotProduction;
}

// Demo mode
function toggleDemoMode(_isDemoMode) {
  if (_isDemoMode !== isDemoMode) {
    if (!_isDemoMode) {
      document.body.style.backgroundColor = "";
    } else {
      document.body.style.backgroundColor = "#f3ecff";
      demoActiveRelics = JSON.parse(JSON.stringify(demoRelics));
      d3.shuffle(demoActiveRelics);
      demoActiveRelics = demoActiveRelics.slice(0, 300);
    }
    deleteRelicIds = [];
    document.getElementById("deleteRelics").setAttribute("disabled", "disabled");

    gtag('event', 'toggle_demo_mode', {
      event_category: 'ui_action',
      event_label: 'Toggle Demo Mode',
      isDemoMode: _isDemoMode,
    });
  }

  isDemoMode = _isDemoMode;
  document.querySelectorAll("#demoSwitchStatus").forEach(e => e.textContent = isDemoMode ? "ON" : "OFF");
  document.querySelectorAll("input.switch-input").forEach(e => {
    if (e.checked === _isDemoMode) return;
    e.checked = _isDemoMode;
  });
  renderRelics();
}
document.querySelectorAll("input.switch-input").forEach(e => e.addEventListener("change", (event) => toggleDemoMode(event.target.checked)));

function showConfirmDialog(title, message) {
  return new Promise(resolve => {
    const modal = new tingle.modal({
      footer: true,
      closeMethods: ['overlay', 'button', 'escape'],
      closeLabel: "閉じる",
    });

    modal.setContent(`
      <h3 style="margin:0">${title ?? ""}</h3>
      <p>${message ?? ""}</p>
    `);
    modal.addFooterBtn('削除', 'tingle-btn tingle-btn--danger', function() {
      modal.close();
      resolve(true);
    });
    modal.addFooterBtn('キャンセル', 'tingle-btn tingle-btn--default', function() {
      modal.close();
      resolve(false);
    });

    modal.open();
  });
}

// バージョン情報取得・表示
fetch("https://17number.github.io/enr-relics-simulator/version.json")
  .then(res => res.json())
  .then(v => {
    const hash = v.hash;
    const date = new Date(v.date).toLocaleString();
    document.getElementById("version").textContent =
      `Commit: ${hash} (${date})`;
  })
  .catch(() => {});

/* initialize */
loadAll()
  .then(() => {
    renderWithData();
    document.getElementById("resultsArea").textContent = "準備完了。キャラ/効果/デメリット を設定し、探索開始ボタンを押してください。";
  }).catch(e => {
    console.error(e);
    document.getElementById("resultsArea").textContent = "読み込み失敗。コンソールを確認してください。";
  })
