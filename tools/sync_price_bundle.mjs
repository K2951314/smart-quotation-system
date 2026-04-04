import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const DataUtils = require("../merger/lib/data-utils");
const BundleUtils = require("../merger/lib/bundle-utils");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SYSTEM_CONFIG = "config/system.json";
const DEFAULT_PRICE_CONFIG = "config/price-source.json";
const DEFAULT_PRICE_SCHEMA = "config/price-source.schema.json";
const SUPPORTED_KINDS = new Set(["csv", "json", "xlsx", "js"]);

function resolveFromRoot(inputPath) {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.join(ROOT_DIR, inputPath);
}

async function loadJsonFile(filePath) {
  try {
    const full = resolveFromRoot(filePath);
    const raw = await readFile(full, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function parseArgs(argv) {
  const out = {
    configPath: DEFAULT_SYSTEM_CONFIG,
    priceConfigPath: DEFAULT_PRICE_CONFIG,
    schemaPath: DEFAULT_PRICE_SCHEMA,
    outputPath: "",
    mode: "encrypted",
  };
  const args = Array.isArray(argv) ? argv :[];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--config" && args[i + 1]) out.configPath = args[++i];
    else if (arg === "--price-config" && args[i + 1]) out.priceConfigPath = args[++i];
    else if (arg === "--schema" && args[i + 1]) out.schemaPath = args[++i];
    else if (arg === "--output" && args[i + 1]) out.outputPath = args[++i];
    else if (arg === "--mode" && args[i + 1]) out.mode = args[++i];
  }
  return out;
}

export function getUrlExt(url) {
  const clean = String(url || "").split("?")[0].toLowerCase();
  const idx = clean.lastIndexOf(".");
  return idx < 0 ? "" : clean.slice(idx + 1);
}

export function detectSourceKind(url, contentType) {
  const ext = getUrlExt(url);
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("text/html") || ext === "html" || ext === "htm") return "html";
  if (ext === "js" || ct.includes("javascript")) return "js";
  if (ext === "json" || ct.includes("application/json")) return "json";
  if (ext === "csv" || ct.includes("text/csv")) return "csv";
  if (ext === "xlsx" || ext === "xls" || ct.includes("spreadsheet") || ct.includes("excel")) return "xlsx";
  return "unknown";
}

export function parseCsvLine(line) {
  const out =[];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (quoted && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function parseCsvRows(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return[];
  const headers = parseCsvLine(lines[0]).map((x) => x.trim());
  const rows =[];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = (cols[j] || "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function toStringSafe(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizePriceConfig(raw) {
  const config = raw || {};
  return {
    price_source_url: String(config.price_source_url || config.PRICE_SOURCE_URL || "").trim(),
    price_source_token: String(config.price_source_token || config.PRICE_SOURCE_TOKEN || "").trim(),
    allowed_content_types: Array.isArray(config.allowed_content_types) ? config.allowed_content_types :["xlsx", "csv", "json", "js"],
    timeout_ms: Number(config.timeout_ms || 15000),
    max_bytes: Number(config.max_bytes || 20 * 1024 * 1024),
  };
}

function resolveMode(modeRaw) {
  const mode = String(modeRaw || "encrypted").trim().toLowerCase();
  if (mode !== "encrypted" && mode !== "plain") {
    throw new Error("mode must be encrypted or plain");
  }
  return mode;
}

function isKindAllowed(kind, allowedKinds) {
  const normalized = String(kind || "").toLowerCase();
  return allowedKinds.indexOf(normalized) >= 0;
}

function assertSupportedSourceKind(kind, allowedKinds) {
  if (kind === "html") throw new Error("Source URL points to an HTML page, not a downloadable data file");
  if (!isKindAllowed(kind, allowedKinds)) throw new Error(`Unsupported price source type: ${kind}`);
}

function ensureMaxBytes(contentLength, maxBytes) {
  if (!contentLength) return;
  const size = Number(contentLength);
  if (Number.isFinite(size) && size > maxBytes) throw new Error(`Response too large: ${size} bytes (limit ${maxBytes})`);
}

async function readXlsxRows(buffer) {
  let XLSX;
  try {
    XLSX = require("xlsx");
  } catch (err) {
    throw new Error("XLSX source detected but package 'xlsx' is missing");
  }
  const binary = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const wb = XLSX.read(binary, { type: "buffer" });
  if (!wb.SheetNames.length) return [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function rowsFromBySpec(bySpec) {
  const source = bySpec && typeof bySpec === "object" ? bySpec : {};
  const specs = Object.keys(source);
  const rows =[];
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const item = source[spec] || {};
    rows.push({
      代码: toStringSafe(item.c),
      规格型号: spec,
      销售单价: Number(item.p) || 0,
      名称: toStringSafe(item.n),
      助记码: toStringSafe(item.m),
      补充说明: toStringSafe(item.r),
      别名: toStringSafe(item.a),
      特价: toStringSafe(item.s),
      brand: toStringSafe(item.b),
    });
  }
  return rows;
}

function rowsFromJsonData(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.rows)) return data.rows;
  if (data && typeof data === "object" && data.bySpec && typeof data.bySpec === "object") return rowsFromBySpec(data.bySpec);
  throw new Error("JSON source must be price rows array, { rows }, or { bySpec }");
}

function parsePriceBundleFromScript(scriptText) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(String(scriptText || ""), sandbox, { timeout: 3000 });
  const priceBundle = sandbox.window.PRICE_BUNDLE || sandbox.PRICE_BUNDLE;
  if (!priceBundle) throw new Error("price.bundle.js did not define window.PRICE_BUNDLE");
  return priceBundle;
}

async function readResponseBodyByKind(response, kind, maxBytes) {
  if (kind === "json") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`Response too large`);
    return { jsonData: JSON.parse(text) };
  }
  if (kind === "csv" || kind === "js") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`Response too large`);
    return { text };
  }
  if (kind === "xlsx") {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error(`Response too large`);
    return { buffer: new Uint8Array(ab) };
  }
  throw new Error(`Unsupported price source type: ${kind}`);
}

async function parseSourceToRows(kind, body, password) {
  if (kind === "json") return rowsFromJsonData(body.jsonData);
  if (kind === "csv") return parseCsvRows(body.text || "");
  if (kind === "xlsx") return readXlsxRows(body.buffer || new Uint8Array());
  if (kind === "js") {
    const priceBundle = parsePriceBundleFromScript(body.text || "");
    const decoded = await BundleUtils.decodePriceBundle(priceBundle, priceBundle.secured ? String(password || "") : "");
    return rowsFromBySpec(decoded.bySpec || {});
  }
  throw new Error(`Unsupported price source type: ${kind}`);
}

function canonicalizeBySpec(bySpec) {
  const input = bySpec || {};
  const keys = Object.keys(input).sort();
  const sorted = {};
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const item = input[key] || {};
    sorted[key] = {
      c: toStringSafe(item.c),
      p: Number(item.p) || 0,
      s: toStringSafe(item.s),
      r: toStringSafe(item.r),
      b: toStringSafe(item.b),
      n: toStringSafe(item.n),
      m: toStringSafe(item.m),
      a: toStringSafe(item.a),
    };
  }
  return JSON.stringify(sorted);
}

function hashBySpec(bySpec) {
  return createHash("sha256").update(canonicalizeBySpec(bySpec), "utf8").digest("hex");
}

async function readExistingBundle(outputPath) {
  if (!outputPath) return null;
  try {
    const scriptText = await readFile(outputPath, "utf8");
    return parsePriceBundleFromScript(scriptText);
  } catch (err) {
    return null;
  }
}

async function decodeExistingBySpec(bundle, mode, password) {
  if (!bundle) return null;
  const wantSecured = mode === "encrypted";
  if (!!bundle.secured !== wantSecured) return null;
  try {
    const decoded = await BundleUtils.decodePriceBundle(bundle, wantSecured ? String(password || "") : "");
    return decoded.bySpec || {};
  } catch (err) {
    return null;
  }
}

function buildPriceBundleScript(bySpec, mode, password, sourceUrl, dataHash, sourceMeta) {
  const secured = mode === "encrypted";
  const pw = secured ? String(password || "") : "";
  return BundleUtils.encodePriceBundle({ bySpec: bySpec || {} }, pw).then((bundle) => {
    bundle.meta = { ...bundle.meta, source: sourceUrl, generated_at: new Date().toISOString(), data_hash: dataHash, source_etag: (sourceMeta && sourceMeta.etag) || "", source_last_modified: (sourceMeta && sourceMeta.lastModified) || "", mode };
    return { bundle, script: `${BundleUtils.toWindowScript("PRICE_BUNDLE", bundle)}\n` };
  });
}

export async function resolveRuntimeConfig(options) {
  const opts = options || {};
  const args = parseArgs(opts.argv || process.argv.slice(2));

  let systemConfig = { app: {} };
  const loadedSys = await loadJsonFile(opts.configPath || args.configPath);
  if (loadedSys) systemConfig = loadedSys;

  let priceRaw = {};
  const loadedPrice = await loadJsonFile(opts.priceConfigPath || args.priceConfigPath);
  if (loadedPrice) priceRaw = loadedPrice;

  const merged = normalizePriceConfig(priceRaw);
  merged.price_source_url = String(process.env.PRICE_SOURCE_URL || merged.price_source_url || "").trim();
  merged.price_source_token = String(process.env.PRICE_SOURCE_TOKEN || merged.price_source_token || "").trim();

  if (!merged.price_source_url) {
    throw new Error("Missing price source URL (PRICE_SOURCE_URL secret is not set)");
  }

  let finalOutputPath = args.outputPath || (systemConfig.app && systemConfig.app.price_bundle_path) || "data/price.bundle.js";
  finalOutputPath = path.isAbsolute(finalOutputPath) ? finalOutputPath : path.resolve(process.cwd(), finalOutputPath);

  let mode = resolveMode(opts.mode || args.mode);
  const password = String(process.env.PRICE_BUNDLE_PASSWORD || "").trim();

  // 【智能兜底】无密码即转公开版
  if (mode === "encrypted" && !password) mode = "plain";

  return { args, systemConfig, priceConfig: merged, outputPath: finalOutputPath, mode, pricePassword: password };
}

export async function syncPriceBundle(options) {
  const opts = options || {};
  const runtime = opts.runtime || (await resolveRuntimeConfig(opts));
  const sourceUrl = runtime.priceConfig.price_source_url;
  const token = runtime.priceConfig.price_source_token;
  const allowedKinds = runtime.priceConfig.allowed_content_types.map((x) => String(x).toLowerCase());
  const timeoutMs = Number(runtime.priceConfig.timeout_ms);
  const maxBytes = Number(runtime.priceConfig.max_bytes);
  let mode = runtime.mode;
  const outputPath = runtime.outputPath || path.resolve(process.cwd(), "data/price.bundle.js");
  const password = runtime.pricePassword;

  const existingBundle = await readExistingBundle(outputPath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (existingBundle && existingBundle.meta && existingBundle.meta.source_etag) headers["If-None-Match"] = String(existingBundle.meta.source_etag);
  if (existingBundle && existingBundle.meta && existingBundle.meta.source_last_modified) headers["If-Modified-Since"] = String(existingBundle.meta.source_last_modified);

  let response;
  try {
    response = await fetch(sourceUrl, { method: "GET", headers, cache: "no-store", signal: controller.signal });
  } catch (err) {
    throw new Error("Source request timed out or failed");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 304 && existingBundle) {
    const existingBySpec = await decodeExistingBySpec(existingBundle, mode, password);
    if (existingBySpec) {
      return {
        outputPath, kind: "not_modified", contentType: String(response.headers.get("content-type") || ""),
        rowCount: Object.keys(existingBySpec).length, source: sourceUrl,
        generatedAt: String(existingBundle.meta.generated_at || ""), changed: false,
        dataHash: hashBySpec(existingBySpec), secured: mode === "encrypted",
      };
    }
    response = await fetch(sourceUrl, { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  }

  if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}`);
  ensureMaxBytes(response.headers.get("content-length"), maxBytes);

  const contentType = String(response.headers.get("content-type") || "");
  const responseEtag = String(response.headers.get("etag") || "");
  const responseLastModified = String(response.headers.get("last-modified") || "");
  const kind = detectSourceKind(sourceUrl, contentType);
  assertSupportedSourceKind(kind, allowedKinds);

  const body = await readResponseBodyByKind(response, kind, maxBytes);
  const rows = await parseSourceToRows(kind, body, password);
  const dataset = DataUtils.buildPriceDataset(rows);
  const bySpec = (dataset && dataset.bySpec) || {};
  const dataHash = hashBySpec(bySpec);

  const existingBySpec2 = await decodeExistingBySpec(existingBundle, mode, password);
  if (existingBySpec2 && hashBySpec(existingBySpec2) === dataHash) {
    return {
      outputPath, kind, contentType, rowCount: Object.keys(bySpec).length, source: sourceUrl,
      generatedAt: String(existingBundle.meta.generated_at || ""), changed: false,
      dataHash, secured: mode === "encrypted",
    };
  }

  const built = await buildPriceBundleScript(bySpec, mode, password, sourceUrl, dataHash, { etag: responseEtag, lastModified: responseLastModified });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, built.script, "utf8");

  return { outputPath, kind, contentType, rowCount: Object.keys(bySpec).length, source: sourceUrl, generatedAt: built.bundle.meta.generated_at, changed: true, dataHash, secured: mode === "encrypted" };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  syncPriceBundle({ argv: process.argv.slice(2) })
    .then((res) => console.log(`[sync-price] ${res.changed ? "updated" : "unchanged"} mode=${res.secured ? "encrypted" : "plain"} kind=${res.kind} rows=${res.rowCount} hash=${res.dataHash} output=${res.outputPath}`))
    .catch((err) => { console.error(`[sync-price] failed: ${err.message}`); process.exit(1); });
}