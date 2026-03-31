let PRICE_DATA = { bySpec: {} };
let STOCK_DATA = { byCode: {} };
let PRICE_META = null;
let STOCK_META = null;
let PRICE_SOURCE = "未加载";
let STOCK_SOURCE = "未加载";
let DB = {};
let g_Results = [];
let g_DataReady = false;
let g_DataLoadingPromise = null;
let g_ToastTimer = null;
let g_DiscountPressState = null;

const HOLD_START_DELAY_MS = 280;
const HOLD_REPEAT_INTERVAL_MS = 70;
const MMC_URL = "https://mcweb.mitsubishi-materials.com/concerto-mmsc-ec/login.jsp";
const MMC_PASSWORD = "%461971#";

const DiscountEngine = window.DiscountUtils || {
  DEFAULT_STEP_PERCENT: 0.1,
  sanitizeStepPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0.1;
    return Math.max(0.1, Math.round(num * 100) / 100);
  },
  getDefaultDiscountPreset(item) {
    const source = item || {};
    const compact = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();
    if (compact(source.special).includes("EX活动")) {
      return { percent: 32, source: "ex-activity", label: "EX活动 32%" };
    }
    if (compact(source.spec).includes("OSG")) {
      return { percent: 36, source: "osg", label: "OSG 36%" };
    }
    return { percent: 53, source: "fallback", label: "默认 53%" };
  },
  formatDiscountPercent(value) {
    const num = Number(value);
    const normalized = Number.isFinite(num) ? Math.min(100, Math.max(0, Math.round(num * 100) / 100)) : 53;
    return normalized.toFixed(2).replace(/\.?0+$/, "") + "%";
  },
  shiftDiscountPercent(currentPercent, stepPercent, direction) {
    const current = Number.isFinite(Number(currentPercent)) ? Number(currentPercent) : 53;
    const step = Number.isFinite(Number(stepPercent)) && Number(stepPercent) > 0 ? Math.max(0.1, Number(stepPercent)) : 0.1;
    const dir = Number(direction) < 0 ? -1 : 1;
    const next = current + step * dir;
    return Math.min(100, Math.max(0, Math.round(next * 100) / 100));
  }
};

const ResultSortEngine = window.ResultSort || {
  sortResultsBySelection(results) {
    if (!Array.isArray(results)) return [];
    return results
      .map((row, index) => ({
        row,
        checked: !!(row && row.checked),
        orderIndex: Number.isFinite(Number(row && row.orderIndex))
          ? Number(row.orderIndex)
          : (Number.isFinite(Number(row && row.id)) ? Number(row.id) : index)
      }))
      .sort((left, right) => {
        if (left.checked !== right.checked) return left.checked ? -1 : 1;
        return left.orderIndex - right.orderIndex;
      })
      .map((entry) => entry.row);
  }
};

window.onload = async function () {
  bindUiEvents();
  syncDiscountStepInput(document.getElementById("discountStep").value);
  renderLoadingState("正在同步远程价格与库存数据");
  updateResultCount();
  const ready = await ensureDataLoaded();
  if (ready) {
    renderEmptyState("输入规格后开始查询，可在结果卡中直接调价与勾选复制。");
  } else {
    renderErrorState("远程数据暂未就绪，请稍后重试。");
  }
};

function setStatus(msg, type) {
  const el = document.getElementById("status");
  el.innerText = msg;
  el.className = "status-badge " + (type || "info");
}

function setSearchLoading(loading) {
  const searchBtn = document.getElementById("btnSearch");
  const stockBtn = document.getElementById("btnRegexConvert");
  if (!searchBtn || !stockBtn) return;

  if (loading) {
    if (!searchBtn.dataset.defaultText) searchBtn.dataset.defaultText = searchBtn.textContent;
    if (!stockBtn.dataset.defaultText) stockBtn.dataset.defaultText = stockBtn.textContent;
    searchBtn.textContent = "加载远程数据中...";
    stockBtn.textContent = "数据加载中...";
    searchBtn.disabled = true;
    stockBtn.disabled = true;
    return;
  }

  searchBtn.textContent = searchBtn.dataset.defaultText || "智能查询";
  stockBtn.textContent = stockBtn.dataset.defaultText || "库存查询";
  searchBtn.disabled = false;
  stockBtn.disabled = false;
}

function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function base64ToBytes(base64) {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function decodePlainPayload(payload) {
  return bytesToUtf8(base64ToBytes(payload));
}

async function decryptData(base64Data, password) {
  const encryptedData = base64ToBytes(base64Data);
  const salt = encryptedData.slice(0, 16);
  const iv = encryptedData.slice(16, 28);
  const data = encryptedData.slice(28);

  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  const key = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );

  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

function withCacheBust(url, cacheMode) {
  const mode = String(cacheMode || "hourly").toLowerCase();
  const now = new Date();
  let key = String(now.getTime());
  if (mode === "hourly") {
    key = now.toISOString().slice(0, 13).replace(/[-:T]/g, "");
  } else if (mode === "daily") {
    key = now.toISOString().slice(0, 10).replace(/-/g, "");
  }
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "v=" + encodeURIComponent(key);
}

function loadWindowBundleByScript(url, timeoutMs, globalKey, timeoutErr, loadErr) {
  const previous = window[globalKey];
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      script.remove();
      window[globalKey] = previous;
      reject(new Error(timeoutErr));
    }, timeoutMs);

    delete window[globalKey];
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const bundle = window[globalKey];
      if (!bundle) {
        window[globalKey] = previous;
        reject(new Error(loadErr));
        return;
      }
      resolve(bundle);
    };
    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.remove();
      window[globalKey] = previous;
      reject(new Error(loadErr));
    };
    document.head.appendChild(script);
  });
}

async function parsePriceBundle(priceObj) {
  if (!priceObj) throw new Error("未找到远程价格包");
  let jsonText = "";

  if (priceObj.secured) {
    setStatus("价格包已加密，请输入密码", "lock");
    const pwd = prompt("请输入价格包密码：");
    if (!pwd) throw new Error("未输入价格包密码");
    try {
      jsonText = await decryptData(priceObj.payload, pwd);
    } catch (err) {
      throw new Error("价格包解密失败，请确认密码");
    }
  } else {
    jsonText = decodePlainPayload(priceObj.payload || "");
  }

  const parsed = JSON.parse(jsonText || "{}");
  return {
    bySpec: parsed.bySpec || {},
    meta: priceObj.meta || null
  };
}

function parseStockBundle(stockObj) {
  if (!stockObj) throw new Error("未找到远程库存包");
  if (stockObj.secured) throw new Error("库存包必须保持明文");
  const text = decodePlainPayload(stockObj.payload || "");
  const parsed = JSON.parse(text || "{}");
  return {
    byCode: parsed.byCode || {},
    meta: stockObj.meta || null
  };
}

function getRemotePriceConfig() {
  const cfg = (window.APP_CONFIG && window.APP_CONFIG.remotePrice) || {};
  return {
    enabled: !!cfg.enabled,
    manifestUrl: String(cfg.manifestUrl || "").trim(),
    timeoutMs: Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 8000,
    cacheBust: String(cfg.cacheBust || "daily")
  };
}

function getRemoteStockConfig() {
  const cfg = (window.APP_CONFIG && window.APP_CONFIG.remoteStock) || {};
  return {
    enabled: !!cfg.enabled,
    url: String(cfg.url || "").trim(),
    timeoutMs: Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 8000,
    cacheBust: String(cfg.cacheBust || "daily")
  };
}

function applyPriceDataset(parsed, source) {
  PRICE_DATA = { bySpec: parsed.bySpec || {} };
  PRICE_META = parsed.meta || null;
  PRICE_SOURCE = source;
  updateVersionText();
}

function applyStockDataset(parsed, source) {
  STOCK_DATA = { byCode: parsed.byCode || {} };
  STOCK_META = parsed.meta || null;
  STOCK_SOURCE = source;
  updateVersionText();
}

async function loadPriceBundleByScript(url, timeoutMs) {
  const priceObj = await loadWindowBundleByScript(
    url,
    timeoutMs,
    "PRICE_BUNDLE",
    "远程价格加载超时",
    "远程价格脚本加载失败"
  );
  return parsePriceBundle(priceObj);
}

async function loadStockBundleByScript(url, timeoutMs) {
  const stockObj = await loadWindowBundleByScript(
    url,
    timeoutMs,
    "STOCK_BUNDLE",
    "远程库存加载超时",
    "远程库存脚本加载失败"
  );
  return parseStockBundle(stockObj);
}

async function loadRemotePriceFromManifest() {
  const cfg = getRemotePriceConfig();
  if (!cfg.enabled || !cfg.manifestUrl) throw new Error("未配置远程价格清单");

  const manifestResp = await fetch(withCacheBust(cfg.manifestUrl, cfg.cacheBust), { cache: "no-store" });
  if (!manifestResp.ok) throw new Error("远程价格清单加载失败 HTTP " + manifestResp.status);

  const manifest = await manifestResp.json();
  const latest = String((manifest && manifest.latest) || "").trim();
  if (!latest) throw new Error("远程价格清单缺少 latest 字段");

  const bundleUrl = new URL(latest, cfg.manifestUrl).href;
  return loadPriceBundleByScript(bundleUrl, cfg.timeoutMs);
}

async function loadRemoteStockBundle() {
  const cfg = getRemoteStockConfig();
  if (!cfg.enabled || !cfg.url) throw new Error("未配置远程库存地址");
  return loadStockBundleByScript(withCacheBust(cfg.url, cfg.cacheBust), cfg.timeoutMs);
}

async function ensureDataLoaded() {
  if (g_DataReady) return true;
  if (g_DataLoadingPromise) return g_DataLoadingPromise;

  g_DataLoadingPromise = (async () => {
    setSearchLoading(true);
    setStatus("正在同步远程数据", "info");
    try {
      const [remotePrice, remoteStock] = await Promise.all([
        loadRemotePriceFromManifest(),
        loadRemoteStockBundle()
      ]);
      applyPriceDataset(remotePrice, "远程(manifest)");
      applyStockDataset(remoteStock, "远程(stock-data)");
      rebuildMergedDB();
      g_DataReady = true;
      setStatus("数据已加载", "ok");
      return true;
    } catch (err) {
      setStatus("远程数据加载失败", "error");
      showToast(err.message || "远程数据加载失败");
      return false;
    } finally {
      setSearchLoading(false);
      g_DataLoadingPromise = null;
    }
  })();

  return g_DataLoadingPromise;
}

function rebuildMergedDB() {
  DB = {};
  const bySpec = PRICE_DATA.bySpec || {};
  const byCode = STOCK_DATA.byCode || {};

  Object.keys(bySpec).forEach((spec) => {
    const item = bySpec[spec] || {};
    const code = item.c || "";
    DB[spec] = {
      c: code,
      p: Number(item.p) || 0,
      s: item.s || "",
      r: item.r || "",
      b: item.b || "",
      n: item.n || "",
      m: item.m || "",
      a: item.a || "",
      i: byCode[code] || ""
    };
  });
}

function updateVersionText() {
  const pVer = (PRICE_META && PRICE_META.version) ? PRICE_META.version : "-";
  const sVer = (STOCK_META && STOCK_META.version) ? STOCK_META.version : "-";
  const pSrc = PRICE_SOURCE || "未加载";
  const sSrc = STOCK_SOURCE || "未加载";
  document.getElementById("versions").textContent =
    "价格版本: " + pVer + " | 价格来源: " + pSrc + " | 库存版本: " + sVer + " | 库存来源: " + sSrc;
}

function getQueryLines() {
  const text = document.getElementById("queryInput").value;
  return text.split(/\r?\n/).filter((line) => line.trim());
}

function hasStockValue(text) {
  if (!window.QueryRegex || typeof window.QueryRegex.hasStockValue !== "function") {
    return !!String(text || "").trim();
  }
  return window.QueryRegex.hasStockValue(text);
}

function convertPlainLineToRegex(line) {
  if (!window.QueryRegex || typeof window.QueryRegex.convertPlainLineToRegex !== "function") {
    throw new Error("正则模块未加载");
  }
  return window.QueryRegex.convertPlainLineToRegex(line);
}

function matchRegexTarget(target, re) {
  if (!window.QueryRegex || typeof window.QueryRegex.matchRegexTarget !== "function") {
    throw new Error("正则模块未加载");
  }
  return window.QueryRegex.matchRegexTarget(target, re);
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCompactNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(2).replace(/\.?0+$/, "");
}

function updateResultCount() {
  document.getElementById("resultCount").textContent = String(g_Results.length);
}

function getSelectedCount() {
  return g_Results.filter((row) => row.checked).length;
}

function syncToggleAllState() {
  const master = document.getElementById("toggleAllResults");
  if (!master) return;

  const checkboxes = Array.from(document.querySelectorAll('#resultBody input[type="checkbox"][data-id]'));
  if (!checkboxes.length) {
    master.checked = false;
    master.indeterminate = false;
    return;
  }

  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  master.checked = checkedCount === checkboxes.length;
  master.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function updateSelectionUi() {
  const selectedCount = getSelectedCount();
  const selectedCountEl = document.getElementById("selectedCount");
  if (selectedCountEl) selectedCountEl.textContent = String(selectedCount);

  const copyBtn = document.getElementById("btnCopy");
  if (copyBtn) {
    if (!copyBtn.dataset.baseText) copyBtn.dataset.baseText = copyBtn.textContent || "复制勾选";
    copyBtn.textContent = selectedCount > 0
      ? copyBtn.dataset.baseText + " (" + selectedCount + ")"
      : copyBtn.dataset.baseText;
  }

  syncToggleAllState();
}

function renderStateCard(kind, title, message, hint) {
  const body = document.getElementById("resultBody");
  const skeleton = kind === "loading"
    ? '<div class="state-skeleton"><span class="skeleton-line skeleton-line-wide"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-line-short"></span></div>'
    : "";

  body.innerHTML = [
    '<section class="state-card state-card--', kind, '">',
    '<span class="state-kicker">', escapeHtml(title), "</span>",
    "<h3>", escapeHtml(message), "</h3>",
    hint ? "<p>" + escapeHtml(hint) + "</p>" : "",
    skeleton,
    "</section>"
  ].join("");

  updateSelectionUi();
}

function renderLoadingState(message) {
  renderStateCard("loading", "数据同步", message, "首次打开会预加载远程价格与库存数据。");
}

function renderEmptyState(message) {
  renderStateCard("empty", "等待查询", message, "支持规格、代码、助记码、别名、备注和特价关键词。");
}

function renderErrorState(message) {
  renderStateCard("error", "加载失败", message, "请检查网络、远程清单或价格包密码。");
}

function getCurrentPriceSettings() {
  const decimals = parseInt(document.getElementById("decimals").value, 10);
  const threshold = parseFloat(document.getElementById("threshold").value);
  return {
    decimals: Number.isFinite(decimals) ? decimals : 0,
    threshold: Number.isFinite(threshold) ? threshold : 100
  };
}

function getCurrentDiscountStep() {
  return DiscountEngine.sanitizeStepPercent(document.getElementById("discountStep").value);
}

function updateStepPresetState(stepValue) {
  const normalized = DiscountEngine.sanitizeStepPercent(stepValue);
  document.querySelectorAll(".step-preset").forEach((button) => {
    const buttonValue = DiscountEngine.sanitizeStepPercent(button.dataset.step);
    button.classList.toggle("is-active", buttonValue === normalized);
  });
}

function syncDiscountStepInput(value) {
  const normalized = DiscountEngine.sanitizeStepPercent(value);
  document.getElementById("discountStep").value = formatCompactNumber(normalized);
  updateStepPresetState(normalized);
}

function setDiscountStepPreset(button) {
  if (!button) return;
  syncDiscountStepInput(button.dataset.step || DiscountEngine.DEFAULT_STEP_PERCENT);
}

function normalizeExactText(value) {
  return String(value || "").trim().toUpperCase();
}

function isExactSpecMatch(inputLine, spec) {
  return normalizeExactText(inputLine) !== "" && normalizeExactText(inputLine) === normalizeExactText(spec);
}

function getSearchTarget(spec, item) {
  const source = item || {};
  return {
    spec: spec || "",
    code: source.c || "",
    mnemonic: source.m || "",
    remark: source.r || "",
    alias: source.a || "",
    special: source.s || ""
  };
}

function findMatchesByRegex(line, allKeys, onlyInStock) {
  const re = convertPlainLineToRegex(line);
  if (!re) return [];

  return allKeys.filter((key) => {
    const item = DB[key] || {};
    if (onlyInStock && !hasStockValue(item.i)) return false;
    return matchRegexTarget(getSearchTarget(key, item), re);
  });
}

function getRowById(id) {
  const rowId = Number(id);
  if (!Number.isInteger(rowId)) return null;
  return g_Results.find((row) => row && row.id === rowId) || null;
}

function calcDiscountedPrice(facePrice, discount, decimals, threshold) {
  const rawCalc = facePrice * discount;
  const factor = Math.pow(10, decimals);
  let finalPrice = Math.ceil(rawCalc * factor) / factor;
  if (finalPrice > threshold) finalPrice = Math.ceil(rawCalc);
  const display = (finalPrice % 1 === 0 && finalPrice > threshold)
    ? finalPrice.toFixed(0) : finalPrice.toFixed(decimals);
  return { value: finalPrice, display: display };
}

function normalizeDiscountPercent(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number.isFinite(Number(fallback)) ? Number(fallback) : 53;
  return Math.min(100, Math.max(0, Math.round(num * 100) / 100));
}

function flashPriceCell(priceCell) {
  if (!priceCell) return;
  if (priceCell._flashFrame) window.cancelAnimationFrame(priceCell._flashFrame);
  priceCell.classList.remove("is-flashing");
  priceCell._flashFrame = window.requestAnimationFrame(() => {
    priceCell.classList.add("is-flashing");
    priceCell._flashFrame = null;
  });
}

function refreshRowPrice(row, flash) {
  if (!row) return;
  const settings = getCurrentPriceSettings();
  const priceInfo = calcDiscountedPrice(
    row.facePrice,
    row.discountPercent / 100,
    settings.decimals,
    settings.threshold
  );
  row.price = priceInfo.display;

  const resultCard = row.cardEl || document.querySelector('.result-card[data-row-id="' + row.id + '"]');
  if (!resultCard) return;
  row.cardEl = resultCard;

  const priceCell = row.priceEl || resultCard.querySelector(".price");
  const discountInput = row.discountInputEl || resultCard.querySelector(".discount-manual");

  if (priceCell) row.priceEl = priceCell;
  if (discountInput) row.discountInputEl = discountInput;
  if (discountInput) discountInput.value = formatCompactNumber(row.discountPercent);
  if (priceCell) {
    priceCell.textContent = priceInfo.display;
    if (flash) flashPriceCell(priceCell);
  }
}

function refreshRenderedPrices() {
  g_Results.forEach((row) => refreshRowPrice(row, false));
}

function syncRowSelectionState(row) {
  if (!row) return;
  const resultCard = row.cardEl || document.querySelector('.result-card[data-row-id="' + row.id + '"]');
  if (!resultCard) return;

  row.cardEl = resultCard;
  resultCard.classList.toggle("is-selected", !!row.checked);
  resultCard.setAttribute("data-checked", row.checked ? "true" : "false");
}

function syncResultOrder() {
  const resultList = document.getElementById("resultBody");
  if (!resultList || !g_Results.length) return;

  g_Results = ResultSortEngine.sortResultsBySelection(g_Results);
  const fragment = document.createDocumentFragment();

  g_Results.forEach((row) => {
    syncRowSelectionState(row);
    if (row && row.cardEl) fragment.appendChild(row.cardEl);
  });

  resultList.appendChild(fragment);
}

function applyManualDiscount(id, rawValue) {
  const row = getRowById(id);
  if (!row) return;
  row.discountPercent = normalizeDiscountPercent(rawValue, row.discountPercent);
  refreshRowPrice(row, true);
}

function getDiscountButtonMarkup(rowId, direction) {
  const symbol = direction < 0 ? "-" : "+";
  const label = direction < 0 ? "降低折扣" : "提高折扣";
  return [
    '<button type="button" class="discount-stepper-btn"',
    ' onpointerdown="startDiscountPress(event, ', rowId, ", ", direction, ')"',
    ' onclick="handleDiscountButtonClick(event, ', rowId, ", ", direction, ')"',
    ' aria-label="', label, '">',
    symbol,
    "</button>"
  ].join("");
}

function appendResultRow(resultList, matchKey, item, shouldCheck, isExact) {
  const preset = DiscountEngine.getDefaultDiscountPreset({
    spec: matchKey,
    special: item.s || ""
  });
  const settings = getCurrentPriceSettings();
  const priceInfo = calcDiscountedPrice(item.p, preset.percent / 100, settings.decimals, settings.threshold);
  const rowData = {
    id: g_Results.length,
    orderIndex: g_Results.length,
    code: item.c || "",
    spec: matchKey,
    mnemonic: item.m || "",
    alias: item.a || "",
    price: priceInfo.display,
    facePrice: Number(item.p) || 0,
    remark: item.r || "",
    special: item.s || "",
    stock: item.i || "",
    discountPercent: preset.percent,
    discountLabel: preset.label,
    checked: shouldCheck
  };
  g_Results.push(rowData);

  const stockMarkup = hasStockValue(rowData.stock)
    ? '<span class="stock-chip">库存 ' + escapeHtml(rowData.stock) + "</span>"
    : "";
  const specialMarkup = rowData.special
    ? '<span class="special-chip">' + escapeHtml(rowData.special) + "</span>"
    : "";
  const remarkMarkup = rowData.remark
    ? '<span class="info-note info-note-inline">' + escapeHtml(rowData.remark) + "</span>"
    : "";
  const metaLineMarkup = (specialMarkup || remarkMarkup)
    ? '<div class="meta-line">' + specialMarkup + remarkMarkup + "</div>"
    : "";

  const resultCard = document.createElement("article");
  resultCard.className = "result-card" + (isExact ? " match-exact" : "");
  resultCard.setAttribute("data-row-id", String(rowData.id));
  resultCard.innerHTML = [
    '<div class="result-row">',
    '<label class="select-chip discount-select-chip"><input type="checkbox" data-id="', rowData.id, '" ', rowData.checked ? "checked" : "", '><span>勾选</span></label>',
    '<div class="result-summary">',
    '<div class="identity-line">',
    '<div class="identity-code">', escapeHtml(rowData.code || "未设置代码"), "</div>",
    '<h3 class="identity-spec">', escapeHtml(matchKey), "</h3>",
    stockMarkup,
    "</div>",
    metaLineMarkup,
    "</div>",
    '<div class="result-side">',
    '<div class="result-metrics">',
    '<div class="metric-inline"><span class="metric-label">面价</span><strong>', escapeHtml(formatCompactNumber(item.p || 0)), '</strong></div>',
    '<div class="metric-inline metric-inline-accent"><span class="metric-label">含税价</span><strong class="price">', escapeHtml(priceInfo.display), '</strong></div>',
    "</div>",
    '<div class="discount-panel"><div class="discount-stepper" data-id="', rowData.id, '">',
    getDiscountButtonMarkup(rowData.id, -1),
    '<label class="discount-input-shell"><input type="number" class="discount-manual" data-id="', rowData.id, '" min="0" max="100" step="0.1" inputmode="decimal" value="', escapeHtml(formatCompactNumber(rowData.discountPercent)), '"><span class="discount-unit">%</span></label>',
    getDiscountButtonMarkup(rowData.id, 1),
    "</div></div>",
    "</div>",
    "</div>"
  ].join("");

  rowData.cardEl = resultCard;
  rowData.priceEl = resultCard.querySelector(".price");
  rowData.discountInputEl = resultCard.querySelector(".discount-manual");
  syncRowSelectionState(rowData);
  resultList.appendChild(resultCard);
}

function renderSearchResults(lines, onlyInStock) {
  const resultList = document.getElementById("resultBody");
  resultList.innerHTML = "";
  g_Results = [];

  if (!lines.length) {
    renderEmptyState("请输入规格型号或关键字后再查询。");
    updateResultCount();
    return;
  }

  const allKeys = Object.keys(DB);

  lines.forEach((line) => {
    const matches = findMatchesByRegex(line, allKeys, onlyInStock);
    const defaultChecked = matches.length === 1;
    matches.forEach((matchKey) => {
      const item = DB[matchKey];
      if (!item) return;
      const isExact = isExactSpecMatch(line, matchKey);
      appendResultRow(resultList, matchKey, item, isExact || defaultChecked, isExact);
    });
  });

  if (g_Results.length === 0) {
    renderEmptyState("没有找到匹配项，请调整关键词或切换查询方式。");
  }

  syncResultOrder();
  updateResultCount();
  updateSelectionUi();
}

async function doSearch() {
  const ready = await ensureDataLoaded();
  if (!ready) {
    renderErrorState("远程数据加载失败，请稍后重试。");
    return;
  }
  renderSearchResults(getQueryLines(), false);
}

async function doRegexSearchConverted() {
  const ready = await ensureDataLoaded();
  if (!ready) {
    renderErrorState("远程数据加载失败，请稍后重试。");
    return;
  }
  renderSearchResults(getQueryLines(), true);
  showToast("已按库存查询并过滤无库存项");
}

function adjustRowDiscount(id, direction, flash) {
  const row = getRowById(id);
  if (!row) return;
  row.discountPercent = DiscountEngine.shiftDiscountPercent(
    row.discountPercent,
    getCurrentDiscountStep(),
    direction
  );
  refreshRowPrice(row, flash !== false);
}

function clearDiscountPressTimers(state) {
  if (!state) return;
  if (state.timeoutId) window.clearTimeout(state.timeoutId);
  if (state.intervalId) window.clearInterval(state.intervalId);
  state.timeoutId = null;
  state.intervalId = null;
}

function releasePressedButton(state) {
  if (!state || !state.button) return;
  state.button.classList.remove("is-pressing");
  if (typeof state.button.releasePointerCapture === "function" && state.pointerId !== null && state.pointerId !== undefined) {
    try {
      state.button.releasePointerCapture(state.pointerId);
    } catch (err) {
    }
  }
}

function stopDiscountPress(applySingleStep) {
  const state = g_DiscountPressState;
  if (!state) return;
  g_DiscountPressState = null;
  clearDiscountPressTimers(state);
  releasePressedButton(state);
  if (applySingleStep && !state.repeatStarted) {
    adjustRowDiscount(state.id, state.direction);
  }
}

function startDiscountPress(event, id, direction) {
  if (event && typeof event.button === "number" && event.button !== 0) return;
  stopDiscountPress(false);

  const state = {
    id: Number(id),
    direction: Number(direction) < 0 ? -1 : 1,
    button: event && event.currentTarget ? event.currentTarget : null,
    pointerId: event && event.pointerId !== undefined ? event.pointerId : null,
    repeatStarted: false,
    timeoutId: null,
    intervalId: null
  };

  if (state.button) {
    state.button.classList.add("is-pressing");
    if (typeof state.button.setPointerCapture === "function" && state.pointerId !== null) {
      try {
        state.button.setPointerCapture(state.pointerId);
      } catch (err) {
      }
    }
  }

  state.timeoutId = window.setTimeout(() => {
    if (g_DiscountPressState !== state) return;
    state.repeatStarted = true;
    adjustRowDiscount(state.id, state.direction, false);
    state.intervalId = window.setInterval(() => {
      adjustRowDiscount(state.id, state.direction, false);
    }, HOLD_REPEAT_INTERVAL_MS);
  }, HOLD_START_DELAY_MS);

  g_DiscountPressState = state;

  if (event) {
    event.preventDefault();
  }
}

function handleDiscountButtonClick(event, id, direction) {
  if (event && event.detail !== 0) return;
  adjustRowDiscount(id, direction);
}

function handleGlobalPointerUp(event) {
  if (!g_DiscountPressState) return;
  if (g_DiscountPressState.pointerId !== null && event && event.pointerId !== undefined && g_DiscountPressState.pointerId !== event.pointerId) {
    return;
  }
  stopDiscountPress(true);
}

function handleGlobalPointerCancel(event) {
  if (!g_DiscountPressState) return;
  if (g_DiscountPressState.pointerId !== null && event && event.pointerId !== undefined && g_DiscountPressState.pointerId !== event.pointerId) {
    return;
  }
  stopDiscountPress(false);
}

function doCopy() {
  const checkboxes = document.querySelectorAll("#resultBody input[type=checkbox]");
  checkboxes.forEach((cb) => {
    const id = cb.getAttribute("data-id");
    const row = getRowById(id);
    if (row) {
      row.checked = cb.checked;
      syncRowSelectionState(row);
    }
  });
  syncResultOrder();

  const selected = g_Results.filter((row) => row.checked);
  if (selected.length === 0) {
    showToast("请先勾选需要复制的行");
    return;
  }

  const showCode = document.getElementById("chk_code").checked;
  const showSpec = document.getElementById("chk_spec").checked;
  const showPrice = document.getElementById("chk_price").checked;
  const showSpecial = document.getElementById("chk_special").checked;
  const showStock = document.getElementById("chk_stock").checked;
  const showRemark = document.getElementById("chk_remark").checked;

  let text = "";
  selected.forEach((row) => {
    const line1Parts = [];
    if (showCode) line1Parts.push(row.code);
    if (showSpec) line1Parts.push(row.spec);
    if (showPrice) line1Parts.push("含税" + row.price);
    if (showSpecial && row.special) line1Parts.push("特价:" + row.special);
    if (showStock && row.stock) line1Parts.push(row.stock);

    text += line1Parts.join(" ") + "\n";
    if (showRemark && row.remark) text += row.remark + "\n";
  });

  copyToClipboard(text);
}

function toggleAll(source) {
  const checkboxes = document.querySelectorAll("#resultBody input[type=checkbox]");
  checkboxes.forEach((cb) => {
    cb.checked = source.checked;
    const row = getRowById(cb.getAttribute("data-id"));
    if (row) {
      row.checked = cb.checked;
      syncRowSelectionState(row);
    }
  });
  syncResultOrder();
  updateSelectionUi();
}

function openMmcLogin() {
  copyToClipboard(MMC_PASSWORD);
  showToast("已复制密码");
  window.open(MMC_URL, "_blank", "noopener");
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("已复制");
    }).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand("copy");
    showToast("已复制");
  } catch (err) {
  }
  document.body.removeChild(el);
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.innerText = msg;
  toast.style.display = "block";
  if (g_ToastTimer) window.clearTimeout(g_ToastTimer);
  g_ToastTimer = window.setTimeout(() => {
    toast.style.display = "none";
    g_ToastTimer = null;
  }, 1500);
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncMobileActionDockState() {
  const toolbarActions = document.querySelector(".toolbar-actions");
  const backToTopButton = document.getElementById("btnBackToTop");
  if (!toolbarActions) return;

  const shouldStick = window.innerWidth <= 720 && toolbarActions.getBoundingClientRect().top <= 10;
  toolbarActions.classList.toggle("is-stuck", shouldStick);

  if (backToTopButton) {
    const shouldShowBackTop = window.innerWidth <= 720 && window.scrollY > 260;
    backToTopButton.classList.toggle("is-visible", shouldShowBackTop);
  }
}

function bindUiEvents() {
  document.getElementById("discountStep").addEventListener("input", function () {
    updateStepPresetState(this.value);
  });
  document.getElementById("discountStep").addEventListener("change", function () {
    syncDiscountStepInput(this.value);
  });
  document.getElementById("discountStep").addEventListener("blur", function () {
    syncDiscountStepInput(this.value);
  });
  document.getElementById("decimals").addEventListener("change", refreshRenderedPrices);
  document.getElementById("threshold").addEventListener("change", refreshRenderedPrices);
  document.getElementById("resultBody").addEventListener("change", function (event) {
    const target = event.target;
    if (!target || typeof target.matches !== "function") return;
    if (target.matches('input[type="checkbox"][data-id]')) {
      const row = getRowById(target.getAttribute("data-id"));
      if (row) {
        row.checked = target.checked;
        syncRowSelectionState(row);
      }
      syncResultOrder();
      updateSelectionUi();
      return;
    }

    if (target.matches(".discount-manual")) {
      applyManualDiscount(target.getAttribute("data-id"), target.value);
    }
  });
  document.getElementById("resultBody").addEventListener("keydown", function (event) {
    const target = event.target;
    if (!target || typeof target.matches !== "function") return;
    if (!target.matches(".discount-manual")) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
    target.blur();
  });
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", handleGlobalPointerCancel);
  window.addEventListener("blur", function () {
    stopDiscountPress(false);
  });
  window.addEventListener("scroll", syncMobileActionDockState, { passive: true });
  window.addEventListener("resize", syncMobileActionDockState);
  window.requestAnimationFrame(syncMobileActionDockState);
  updateSelectionUi();
}
