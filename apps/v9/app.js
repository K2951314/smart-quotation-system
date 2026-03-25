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
  DEFAULT_STEP_PERCENT: 0.01,
  sanitizeStepPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0.01;
    return Math.round(num * 100) / 100;
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
    const step = Number.isFinite(Number(stepPercent)) && Number(stepPercent) > 0 ? Number(stepPercent) : 0.01;
    const dir = Number(direction) < 0 ? -1 : 1;
    const next = current + step * dir;
    return Math.min(100, Math.max(0, Math.round(next * 100) / 100));
  }
};

window.onload = async function () {
  bindUiEvents();
  syncDiscountStepInput(document.getElementById("discountStep").value);
  renderEmptyState("输入规格后开始查询，结果会显示在这里。");
  updateResultCount();
  await ensureDataLoaded();
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

  searchBtn.textContent = searchBtn.dataset.defaultText || "智能匹配";
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

function renderEmptyState(message) {
  const tbody = document.getElementById("resultBody");
  tbody.innerHTML = '<tr><td class="empty-state" colspan="4">' + escapeHtml(message) + "</td></tr>";
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
  const index = Number(id);
  if (!Number.isInteger(index)) return null;
  return g_Results[index] || null;
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

  const mainRow = document.querySelector('tr[data-row-id="' + row.id + '"]');
  if (!mainRow) return;

  const discountValue = mainRow.querySelector(".discount-value");
  const priceCell = mainRow.querySelector(".price");

  if (discountValue) discountValue.textContent = DiscountEngine.formatDiscountPercent(row.discountPercent);
  if (priceCell) {
    priceCell.textContent = priceInfo.display;
    if (flash) {
      priceCell.classList.remove("is-flashing");
      void priceCell.offsetWidth;
      priceCell.classList.add("is-flashing");
    }
  }
}

function refreshRenderedPrices() {
  g_Results.forEach((row) => refreshRowPrice(row, false));
}

function buildRemarkCell(item) {
  const special = String(item.s || "").trim();
  const alias = String(item.a || "").trim();
  const remark = String(item.r || "").trim();
  const rows = [];

  if (special) rows.push('<span class="remark-badge">' + escapeHtml(special) + "</span>");
  if (alias) rows.push('<span class="remark-text">别名：' + escapeHtml(alias) + "</span>");
  if (remark) rows.push('<span class="remark-text">' + escapeHtml(remark) + "</span>");
  if (!rows.length) rows.push('<span class="remark-text">无补充说明</span>');

  return '<div class="remark-stack">' + rows.join("") + "</div>";
}

function buildMetaLine(matchKey, rowData, item) {
  const parts = [
    '<span class="meta-item"><strong>' + escapeHtml(rowData.code) + "</strong></span>",
    '<span class="meta-item"><strong>' + escapeHtml(matchKey) + "</strong></span>",
    '<span class="meta-item">面价 ' + escapeHtml(formatCompactNumber(item.p || 0)) + "</span>",
    '<span class="meta-item meta-stock">库存 ' + escapeHtml(rowData.stock || "无库存信息") + "</span>",
    '<span class="meta-chip">' + escapeHtml(rowData.discountLabel) + "</span>"
  ];

  if (rowData.mnemonic) {
    parts.push('<span class="meta-item">助记码 ' + escapeHtml(rowData.mnemonic) + "</span>");
  }

  if (rowData.alias) {
    parts.push('<span class="meta-item">别名 ' + escapeHtml(rowData.alias) + "</span>");
  }

  return parts.join("");
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

function appendResultRow(tbody, matchKey, item, isExact) {
  const preset = DiscountEngine.getDefaultDiscountPreset({
    spec: matchKey,
    special: item.s || ""
  });
  const settings = getCurrentPriceSettings();
  const priceInfo = calcDiscountedPrice(item.p, preset.percent / 100, settings.decimals, settings.threshold);
  const rowData = {
    id: g_Results.length,
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
    checked: isExact
  };
  g_Results.push(rowData);

  const metaTr = document.createElement("tr");
  metaTr.className = "result-meta";
  if (isExact) metaTr.classList.add("match-exact");
  metaTr.innerHTML = [
    '<td class="col-check sticky-check" rowspan="2"><input type="checkbox" data-id="', rowData.id, '" ', isExact ? "checked" : "", "></td>",
    '<td class="meta-cell" colspan="3"><div class="meta-line">',
    buildMetaLine(matchKey, rowData, item),
    "</div></td>"
  ].join("");

  const mainTr = document.createElement("tr");
  mainTr.className = "result-main";
  if (isExact) mainTr.classList.add("match-exact");
  mainTr.setAttribute("data-row-id", String(rowData.id));
  mainTr.innerHTML = [
    '<td class="discount-cell-wrap"><div class="discount-stepper" data-id="', rowData.id, '">',
    getDiscountButtonMarkup(rowData.id, -1),
    '<span class="discount-value" data-id="', rowData.id, '">', escapeHtml(DiscountEngine.formatDiscountPercent(rowData.discountPercent)), "</span>",
    getDiscountButtonMarkup(rowData.id, 1),
    "</div></td>",
    '<td class="deal-cell"><span class="price">', escapeHtml(priceInfo.display), "</span></td>",
    '<td class="remark">', buildRemarkCell(item), "</td>"
  ].join("");

  tbody.appendChild(metaTr);
  tbody.appendChild(mainTr);
}

function renderSearchResults(lines, onlyInStock) {
  const tbody = document.getElementById("resultBody");
  tbody.innerHTML = "";
  g_Results = [];

  if (!lines.length) {
    renderEmptyState("请输入规格型号或关键字后再查询。");
    updateResultCount();
    return;
  }

  const allKeys = Object.keys(DB);

  lines.forEach((line) => {
    const matches = findMatchesByRegex(line, allKeys, onlyInStock);
    matches.forEach((matchKey) => {
      const item = DB[matchKey];
      if (!item) return;
      appendResultRow(tbody, matchKey, item, isExactSpecMatch(line, matchKey));
    });
  });

  if (g_Results.length === 0) {
    renderEmptyState("没有找到匹配项，请调整关键词或切换查询方式。");
  }

  updateResultCount();
}

async function doSearch() {
  const ready = await ensureDataLoaded();
  if (!ready) return;
  renderSearchResults(getQueryLines(), false);
}

async function doRegexSearchConverted() {
  const ready = await ensureDataLoaded();
  if (!ready) return;
  renderSearchResults(getQueryLines(), true);
  showToast("已按库存查询并过滤无库存项");
}

function adjustRowDiscount(id, direction) {
  const row = getRowById(id);
  if (!row) return;
  row.discountPercent = DiscountEngine.shiftDiscountPercent(
    row.discountPercent,
    getCurrentDiscountStep(),
    direction
  );
  refreshRowPrice(row, true);
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
    adjustRowDiscount(state.id, state.direction);
    state.intervalId = window.setInterval(() => {
      adjustRowDiscount(state.id, state.direction);
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
    if (row) row.checked = cb.checked;
  });

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
  });
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
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", handleGlobalPointerCancel);
  window.addEventListener("blur", function () {
    stopDiscountPress(false);
  });
}
