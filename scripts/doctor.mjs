import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

function assertExists(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
}

function run() {
  const system = readJson("config/system.json");
  const stockSource = readJson("config/stock-source.json");
  const priceSource = readJson("config/price-source.json");
  readJson("config/stock-source.schema.json");
  readJson("config/price-source.schema.json");

  assertExists(system.app.web_root);
  assertExists(system.sync.script_path);
  assertExists("tools/sync_price_bundle.mjs");
  assertExists("tools/publish_price_bundle.mjs");
  assertExists("tools/publish_stock_bundle.mjs");
  assertExists("merger/lib/data-utils.js");
  assertExists(".github/workflows/sync-stock.yml");
  assertExists(".github/workflows/sync-price.yml");
  assertExists(".github/workflows/ci.yml");
  assertExists("apps/v9/default-discount.json");

  if (!Array.isArray(stockSource.allowed_content_types) || !stockSource.allowed_content_types.length) {
    throw new Error("config/stock-source.json: allowed_content_types is required");
  }
  if (!Number.isFinite(Number(stockSource.timeout_ms))) {
    throw new Error("config/stock-source.json: timeout_ms must be number");
  }
  if (!Number.isFinite(Number(stockSource.max_bytes))) {
    throw new Error("config/stock-source.json: max_bytes must be number");
  }

  if (!Array.isArray(priceSource.allowed_content_types) || !priceSource.allowed_content_types.length) {
    throw new Error("config/price-source.json: allowed_content_types is required");
  }
  if (!Number.isFinite(Number(priceSource.timeout_ms))) {
    throw new Error("config/price-source.json: timeout_ms must be number");
  }
  if (!Number.isFinite(Number(priceSource.max_bytes))) {
    throw new Error("config/price-source.json: max_bytes must be number");
  }

  console.log("doctor: OK");
}

try {
  run();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
