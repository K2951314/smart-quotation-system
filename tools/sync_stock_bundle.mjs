import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const DataUtils = require("../merger/lib/data-utils");
const BundleUtils = require("../merger/lib/bundle-utils");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SYSTEM_CONFIG = "config/system.json";
const DEFAULT_STOCK_CONFIG = "config/stock-source.json";
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
    stockConfigPath: DEFAULT_STOCK_CONFIG,
    outputPath: "",
  };
  const args = Array.isArray(argv) ? argv :[];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--config" && args[i + 1]) out.configPath = args[++i];
    else if (arg === "--stock-config" && args[i + 1]) out.stockConfigPath = args[++i];
    else if (arg === "--output" && args[i + 1]) out.outputPath = args[++i];
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
        current += "\""; i += 1;
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
  if (!lines.length) return [];
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

function normalizeStockConfig(raw) {
  const config = raw || {};
  return {
    stock_source_url: String(config.stock_source_url || config.STOCK_SOURCE_URL || "").trim(),
    stock_source_token: String(config.stock_source_token || config.STOCK_SOURCE_TOKEN || "").trim(),
    allowed_content_types: Array.isArray(config.allowed_content_types) ? config.allowed_content_types : ["csv", "json", "xlsx", "js"],
    timeout_ms: Number(config.timeout_ms || 15000),
    max_bytes: Number(config.max_bytes || 20 * 1024 * 1024),
  };
}

function byCodeFromJson(data) {
  if (data && typeof data === "object" && !Array.isArray(data) && data.byCode && typeof data.byCode === "object") return data.byCode;
  if (Array.isArray(data)) return DataUtils.buildStockByCode(data);
  throw new Error("JSON source must be { byCode } or stock rows array");
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
  if (!wb.SheetNames.length) return[];
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function parseStockBundleFromScript(scriptText) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(String(scriptText || ""), sandbox, { timeout: 3000 });
  const stockBundle = sandbox.window.STOCK_BUNDLE || sandbox.STOCK_BUNDLE;
  if (!stockBundle) throw new Error("stock.bundle.js did not define STOCK_BUNDLE");
  return stockBundle;
}

function byCodeFromStockScript(scriptText) {
  const stockBundle = parseStockBundleFromScript(scriptText);
  const decoded = BundleUtils.decodeStockBundle(stockBundle);
  return decoded.byCode || {};
}

function canonicalizeByCode(stockByCode) {
  const input = stockByCode || {};
  const keys = Object.keys(input).sort();
  const sorted = {};
  for (let i = 0; i < keys.length; i += 1) {
    sorted[keys[i]] = String(input[keys[i]] ?? "");
  }
  return JSON.stringify(sorted);
}

function hashByCode(stockByCode) {
  return createHash("sha256").update(canonicalizeByCode(stockByCode), "utf8").digest("hex");
}

async function readExistingBundleInfo(outputPath) {
  if (!outputPath) return null;
  try {
    const scriptText = await readFile(outputPath, "utf8");
    const bundle = parseStockBundleFromScript(scriptText);
    const decoded = BundleUtils.decodeStockBundle(bundle);
    const byCode = decoded.byCode || {};
    return {
      byCode,
      dataHash: hashByCode(byCode),
      generatedAt: bundle.meta && bundle.meta.generated_at ? String(bundle.meta.generated_at) : "",
      sourceEtag: bundle.meta && bundle.meta.source_etag ? String(bundle.meta.source_etag) : "",
      sourceLastModified: bundle.meta && bundle.meta.source_last_modified ? String(bundle.meta.source_last_modified) : "",
    };
  } catch (err) {
    return null;
  }
}

function isKindAllowed(kind, allowedKinds) {
  const normalized = String(kind || "").toLowerCase();
  return allowedKinds.indexOf(normalized) >= 0;
}

function assertSupportedSourceKind(kind, allowedKinds) {
  if (kind === "html") throw new Error("Source URL points to an HTML page, not a downloadable data file");
  if (!isKindAllowed(kind, allowedKinds)) throw new Error(`Unsupported stock source type: ${kind}`);
}

function ensureMaxBytes(contentLength, maxBytes) {
  if (!contentLength) return;
  const size = Number(contentLength);
  if (Number.isFinite(size) && size > maxBytes) throw new Error(`Response too large: ${size} bytes`);
}

async function readResponseBodyByKind(response, kind, maxBytes) {
  if (kind === "json") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error("Response too large");
    return { jsonData: JSON.parse(text) };
  }
  if (kind === "csv" || kind === "js") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error("Response too large");
    return { text };
  }
  if (kind === "xlsx") {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("Response too large");
    return { buffer: new Uint8Array(ab) };
  }
  throw new Error(`Unsupported type: ${kind}`);
}

async function parseSourceToByCode(kind, body) {
  if (kind === "json") return byCodeFromJson(body.jsonData);
  if (kind === "csv") return DataUtils.buildStockByCode(parseCsvRows(body.text || ""));
  if (kind === "js") return byCodeFromStockScript(body.text || "");
  if (kind === "xlsx") {
    const rows = await readXlsxRows(body.buffer || new Uint8Array());
    return DataUtils.buildStockByCode(rows);
  }
  throw new Error(`Unsupported stock source type: ${kind}`);
}

function buildStockBundleScript(byCode, sourceUrl, dataHash, sourceMeta) {
  const meta = sourceMeta || {};
  const bundle = BundleUtils.encodeStockBundle(byCode || {});
  bundle.meta = { ...bundle.meta, source: sourceUrl, generated_at: new Date().toISOString(), data_hash: dataHash, source_etag: meta.etag || "", source_last_modified: meta.lastModified || "" };
  return { bundle, script: `${BundleUtils.toWindowScript("STOCK_BUNDLE", bundle)}\n` };
}

export async function resolveRuntimeConfig(options) {
  const opts = options || {};
  const args = parseArgs(opts.argv || process.argv.slice(2));

  let systemConfig = { app: {} };
  const sysLoad = await loadJsonFile(opts.configPath || args.configPath);
  if (sysLoad) systemConfig = sysLoad;

  let stockRaw = {};
  const stockLoad = await loadJsonFile(opts.stockConfigPath || args.stockConfigPath);
  if (stockLoad) stockRaw = stockLoad;

  const mergedStock = normalizeStockConfig(stockRaw);
  mergedStock.stock_source_url = String(process.env.STOCK_SOURCE_URL || mergedStock.stock_source_url || "").trim();
  mergedStock.stock_source_token = String(process.env.STOCK_SOURCE_TOKEN || mergedStock.stock_source_token || "").trim();

  if (!mergedStock.stock_source_url) {
    throw new Error("Missing stock source URL (STOCK_SOURCE_URL secret is not set)");
  }

  let finalOutputPath = args.outputPath || (systemConfig.app && systemConfig.app.stock_bundle_path) || "data/stock.bundle.js";
  finalOutputPath = path.isAbsolute(finalOutputPath) ? finalOutputPath : path.resolve(process.cwd(), finalOutputPath);

  return { args, systemConfig, stockConfig: mergedStock, outputPath: finalOutputPath };
}

export async function syncStockBundle(options) {
  const opts = options || {};
  const runtime = opts.runtime || (await resolveRuntimeConfig(opts));
  const sourceUrl = runtime.stockConfig.stock_source_url;
  const token = runtime.stockConfig.stock_source_token;
  const allowedKinds = runtime.stockConfig.allowed_content_types.map((x) => String(x).toLowerCase());
  const timeoutMs = Number(runtime.stockConfig.timeout_ms);
  const maxBytes = Number(runtime.stockConfig.max_bytes);

  // 【强力锁定】绝对保证路径存在
  const outputPath = runtime.outputPath || path.resolve(process.cwd(), "data/stock.bundle.js");

  const existing = await readExistingBundleInfo(outputPath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (existing && existing.sourceEtag) headers["If-None-Match"] = existing.sourceEtag;
  if (existing && existing.sourceLastModified) headers["If-Modified-Since"] = existing.sourceLastModified;

  let response;
  try {
    response = await fetch(sourceUrl, { method: "GET", headers, cache: "no-store", signal: controller.signal });
  } catch (err) {
    throw new Error("Source request timed out or failed");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 304 && existing) {
    return {
      outputPath, kind: "not_modified", contentType: String(response.headers.get("content-type") || ""),
      rowCount: Object.keys(existing.byCode || {}).length, source: sourceUrl,
      generatedAt: existing.generatedAt || "", changed: false, dataHash: existing.dataHash,
    };
  }

  if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}`);
  ensureMaxBytes(response.headers.get("content-length"), maxBytes);

  const contentType = String(response.headers.get("content-type") || "");
  const responseEtag = String(response.headers.get("etag") || "");
  const responseLastModified = String(response.headers.get("last-modified") || "");
  const kind = detectSourceKind(sourceUrl, contentType);
  assertSupportedSourceKind(kind, allowedKinds);

  const body = await readResponseBodyByKind(response, kind, maxBytes);
  const byCode = await parseSourceToByCode(kind, body);
  const dataHash = hashByCode(byCode);

  if (existing && existing.dataHash === dataHash) {
    return {
      outputPath, kind, contentType, rowCount: Object.keys(byCode || {}).length,
      source: sourceUrl, generatedAt: existing.generatedAt || "", changed: false, dataHash,
    };
  }

  const built = buildStockBundleScript(byCode, sourceUrl, dataHash, { etag: responseEtag, lastModified: responseLastModified });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, built.script, "utf8");

  return { outputPath, kind, contentType, rowCount: Object.keys(byCode || {}).length, source: sourceUrl, generatedAt: built.bundle.meta.generated_at, changed: true, dataHash };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  syncStockBundle({ argv: process.argv.slice(2) })
    .then((res) => console.log(`[sync-stock] ${res.changed ? "updated" : "unchanged"} kind=${res.kind} rows=${res.rowCount} hash=${res.dataHash} output=${res.outputPath}`))
    .catch((err) => { console.error(`[sync-stock] failed: ${err.message}`); process.exit(1); });
}