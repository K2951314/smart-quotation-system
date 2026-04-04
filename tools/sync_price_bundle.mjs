import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";

const cwd = process.cwd();
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
  const full = resolveFromRoot(filePath);
  const raw = await readFile(full, "utf8");
  return JSON.parse(raw);
}

export function parseArgs(argv) {
  const out = {
    // ... 其他默认值
    outputPath: "", 
  };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--output" && args[i + 1]) {
      out.outputPath = args[++i]; // 确保这一行能正确把路径存入
    }
    // ...
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
  const out = [];
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
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((x) => x.trim());
  const rows = [];
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
    allowed_content_types: Array.isArray(config.allowed_content_types)
      ? config.allowed_content_types
      : ["xlsx"],
    timeout_ms: Number(config.timeout_ms || 15000),
    max_bytes: Number(config.max_bytes || 20 * 1024 * 1024),
    allowed_domains: Array.isArray(config.allowed_domains) ? config.allowed_domains : [],
  };
}

function ensureObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function validateSystemConfig(config) {
  ensureObject(config, "system config");
  ensureObject(config.app, "system config app");
  const required = [config.app.web_root, config.app.price_bundle_path, config.app.stock_bundle_path];
  for (let i = 0; i < required.length; i += 1) {
    if (!required[i] || typeof required[i] !== "string") {
      throw new Error("system config has missing app path fields");
    }
  }
}

function validatePriceConfig(priceConfig, schema) {
  ensureObject(priceConfig, "price config");
  ensureObject(schema, "price config schema");

  if (!Array.isArray(priceConfig.allowed_content_types) || !priceConfig.allowed_content_types.length) {
    throw new Error("price config allowed_content_types is required");
  }
  for (let i = 0; i < priceConfig.allowed_content_types.length; i += 1) {
    const kind = String(priceConfig.allowed_content_types[i]).toLowerCase();
    if (!SUPPORTED_KINDS.has(kind)) {
      throw new Error(`unsupported kind in allowed_content_types: ${kind}`);
    }
  }
  if (!Number.isFinite(priceConfig.timeout_ms) || priceConfig.timeout_ms < 1000) {
    throw new Error("price config timeout_ms must be >= 1000");
  }
  if (!Number.isFinite(priceConfig.max_bytes) || priceConfig.max_bytes < 1024) {
    throw new Error("price config max_bytes must be >= 1024");
  }
  if (priceConfig.allowed_domains && !Array.isArray(priceConfig.allowed_domains)) {
    throw new Error("price config allowed_domains must be array");
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (let i = 0; i < required.length; i += 1) {
    const key = required[i];
    if (!Object.prototype.hasOwnProperty.call(priceConfig, key)) {
      throw new Error(`price config missing required field: ${key}`);
    }
  }
}

function mergeSourceConfig(priceConfig) {
  const envUrl = String(process.env.PRICE_SOURCE_URL || "").trim();
  const envToken = String(process.env.PRICE_SOURCE_TOKEN || "").trim();
  return {
    ...priceConfig,
    price_source_url: envUrl || priceConfig.price_source_url,
    price_source_token: envToken || priceConfig.price_source_token,
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
  if (kind === "html") {
    throw new Error("Source URL points to an HTML page, not a downloadable data file");
  }
  if (!isKindAllowed(kind, allowedKinds)) {
    throw new Error(`Unsupported price source type: ${kind}`);
  }
}

function isHostAllowed(url, allowedDomains) {
  const list = Array.isArray(allowedDomains) ? allowedDomains.filter(Boolean) : [];
  if (!list.length) return true;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (err) {
    return false;
  }
  for (let i = 0; i < list.length; i += 1) {
    const domain = String(list[i]).toLowerCase();
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

function ensureMaxBytes(contentLength, maxBytes) {
  if (!contentLength) return;
  const size = Number(contentLength);
  if (Number.isFinite(size) && size > maxBytes) {
    throw new Error(`Response too large: ${size} bytes (limit ${maxBytes})`);
  }
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
  const rows = [];
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
  if (data && typeof data === "object" && data.bySpec && typeof data.bySpec === "object") {
    return rowsFromBySpec(data.bySpec);
  }
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
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`Response too large (limit ${maxBytes})`);
    return { jsonData: JSON.parse(text) };
  }
  if (kind === "csv") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`Response too large (limit ${maxBytes})`);
    return { text };
  }
  if (kind === "js") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`Response too large (limit ${maxBytes})`);
    return { text };
  }
  if (kind === "xlsx") {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error(`Response too large (limit ${maxBytes})`);
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
    const decoded = await BundleUtils.decodePriceBundle(
      priceBundle,
      priceBundle.secured ? String(password || "") : ""
    );
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
  try {
    const scriptText = await readFile(outputPath, "utf8");
    return parsePriceBundleFromScript(scriptText);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
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

async function fetchWithTimeout(url, timeoutMs, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: headers || {},
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`Source request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function buildPriceBundleScript(bySpec, mode, password, sourceUrl, dataHash, sourceMeta) {
  const secured = mode === "encrypted";
  const pw = secured ? String(password || "") : "";
  return BundleUtils.encodePriceBundle({ bySpec: bySpec || {} }, pw).then((bundle) => {
    bundle.meta = {
      ...bundle.meta,
      source: sourceUrl,
      generated_at: new Date().toISOString(),
      data_hash: dataHash,
      source_etag: (sourceMeta && sourceMeta.etag) || "",
      source_last_modified: (sourceMeta && sourceMeta.lastModified) || "",
      mode,
    };
    return {
      bundle,
      script: `${BundleUtils.toWindowScript("PRICE_BUNDLE", bundle)}\n`,
    };
  });
}

export async function resolveRuntimeConfig(options) {
  const opts = options || {};
  const args = parseArgs(opts.argv || process.argv.slice(2)); // 确保读取了命令行参数
  const systemConfig = await loadJsonFile(opts.configPath || args.configPath);
  validateSystemConfig(systemConfig);

  const priceRaw = await loadJsonFile(opts.priceConfigPath || args.priceConfigPath);
  const priceSchema = await loadJsonFile(opts.schemaPath || args.schemaPath);
  const normalized = normalizePriceConfig(priceRaw);
  validatePriceConfig(normalized, priceSchema);
  const merged = mergeSourceConfig(normalized);

  if (!merged.price_source_url) {
    throw new Error("Missing price source URL (price_source_url or PRICE_SOURCE_URL)");
  }
  if (!isHostAllowed(merged.price_source_url, merged.allowed_domains)) {
    throw new Error("Source URL host is not in allowed_domains");
  }

  const mode = resolveMode(opts.mode || args.mode);
  const password = String(process.env.PRICE_BUNDLE_PASSWORD || "").trim();
  if (mode === "encrypted" && !password) {
    throw new Error("Missing PRICE_BUNDLE_PASSWORD for encrypted mode");
  }

  return {
    args,
    systemConfig,
    priceConfig: merged,
    // 这里是关键：优先使用命令行传入的 --output，否则用配置文件里的，再否则用默认值
    outputPath: path.resolve(cwd, args.outputPath || systemConfig.app.price_bundle_path || "data/price.bundle.js"),
    mode,
    pricePassword: password,
  };
}

export async function syncPriceBundle(options) {
  const opts = options || {};
  const runtime = opts.runtime || (await resolveRuntimeConfig(opts));
  const sourceUrl = runtime.priceConfig.price_source_url;
  const token = runtime.priceConfig.price_source_token;
  const allowedKinds = runtime.priceConfig.allowed_content_types.map((x) => String(x).toLowerCase());
  const timeoutMs = Number(runtime.priceConfig.timeout_ms);
  const maxBytes = Number(runtime.priceConfig.max_bytes);
  const mode = resolveMode(opts.mode || runtime.mode);
  const password = String(runtime.pricePassword || "");
  if (mode === "encrypted" && !password) {
    throw new Error("Missing PRICE_BUNDLE_PASSWORD for encrypted mode");
  }
  const existingBundle = await readExistingBundle(outputPath);

  const baseHeaders = {};
  if (token) baseHeaders.Authorization = `Bearer ${token}`;

  const conditionalHeaders = { ...baseHeaders };
  if (existingBundle && existingBundle.meta && existingBundle.meta.source_etag) {
    conditionalHeaders["If-None-Match"] = String(existingBundle.meta.source_etag);
  }
  if (existingBundle && existingBundle.meta && existingBundle.meta.source_last_modified) {
    conditionalHeaders["If-Modified-Since"] = String(existingBundle.meta.source_last_modified);
  }

  let response = await fetchWithTimeout(sourceUrl, timeoutMs, conditionalHeaders);
  if (response.status === 304) {
    const existingBySpec = await decodeExistingBySpec(existingBundle, mode, password);
    if (existingBySpec) {
      const dataHash = hashBySpec(existingBySpec);
      const existingMeta = (existingBundle && existingBundle.meta) || {};
      return {
        outputPath,
        kind: "not_modified",
        contentType: String(response.headers.get("content-type") || ""),
        rowCount: Object.keys(existingBySpec).length,
        source: sourceUrl,
        generatedAt: String(existingMeta.generated_at || existingMeta.version || ""),
        changed: false,
        dataHash,
        secured: mode === "encrypted",
      };
    }
    response = await fetchWithTimeout(sourceUrl, timeoutMs, baseHeaders);
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

  const existingBySpec = await decodeExistingBySpec(existingBundle, mode, password);
  if (existingBySpec && hashBySpec(existingBySpec) === dataHash) {
    const existingMeta = (existingBundle && existingBundle.meta) || {};
    return {
      outputPath,
      kind,
      contentType,
      rowCount: Object.keys(bySpec).length,
      source: sourceUrl,
      generatedAt: String(existingMeta.generated_at || existingMeta.version || ""),
      changed: false,
      dataHash,
      secured: mode === "encrypted",
    };
  }

  const built = await buildPriceBundleScript(bySpec, mode, password, sourceUrl, dataHash, {
    etag: responseEtag,
    lastModified: responseLastModified,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, built.script, "utf8");

  return {
    outputPath,
    kind,
    contentType,
    rowCount: Object.keys(bySpec).length,
    source: sourceUrl,
    generatedAt: built.bundle.meta.generated_at,
    changed: true,
    dataHash,
    secured: mode === "encrypted",
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  syncPriceBundle({ argv: process.argv.slice(2) })
    .then((res) => {
      const state = res.changed ? "updated" : "unchanged";
      console.log(
        `[sync-price] ${state} mode=${res.secured ? "encrypted" : "plain"} kind=${res.kind} rows=${res.rowCount} hash=${res.dataHash} output=${res.outputPath}`
      );
    })
    .catch((err) => {
      console.error(`[sync-price] failed: ${err.message}`);
      process.exit(1);
    });
}
