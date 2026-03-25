const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const BundleUtils = require("../merger/lib/bundle-utils");

function jsonResponse(data) {
  const bodyText = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const key = String(name || "").toLowerCase();
        if (key === "content-type") return "application/json";
        if (key === "content-length") return String(Buffer.byteLength(bodyText));
        return null;
      },
    },
    async text() {
      return bodyText;
    },
    async arrayBuffer() {
      return Buffer.from(bodyText).buffer;
    },
  };
}

function readBundle(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(text, sandbox, { timeout: 3000 });
  return sandbox.window.PRICE_BUNDLE || sandbox.PRICE_BUNDLE;
}

async function decodeBundleRows(filePath) {
  const bundle = readBundle(filePath);
  const decoded = await BundleUtils.decodePriceBundle(bundle, "");
  return Object.keys(decoded.bySpec || {}).map((spec) => {
    const item = decoded.bySpec[spec] || {};
    return {
      name: item.n || "",
      mnemonic: item.m || "",
      alias: item.a || "",
      spec,
    };
  });
}

async function run() {
  const mod = await import("../tools/sync_price_bundle.mjs");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-price-name-"));
  const outPath = path.join(tmpDir, "price.bundle.js");
  const originalFetch = global.fetch;
  let version = 0;

  global.fetch = async () => {
    version += 1;
    return jsonResponse([
      {
        ["\u540d\u79f0"]: version === 1 ? "tool" : "OSG Cutter",
        ["\u4ee3\u7801"]: "01.01.0001",
        ["\u89c4\u683c\u578b\u53f7"]: "WNMG080408 UC5115",
        ["\u9500\u552e\u5355\u4ef7"]: "100",
        ["\u52a9\u8bb0\u7801"]: version === 1 ? "TOOL01" : "OSG01",
        ["\u8865\u5145\u8bf4\u660e"]: "remark",
        ["\u522b\u540d"]: version === 1 ? "alias-a" : "alias-b",
        ["\u7279\u4ef7"]: "",
      },
    ]);
  };

  try {
    const runtime = {
      priceConfig: {
        price_source_url: "https://example.com/price.json",
        price_source_token: "",
        allowed_content_types: ["json"],
        timeout_ms: 15000,
        max_bytes: 5 * 1024 * 1024,
        allowed_domains: [],
      },
      outputPath: outPath,
      mode: "plain",
      pricePassword: "",
    };

    const first = await mod.syncPriceBundle({ outputPath: outPath, runtime });
    assert.strictEqual(first.changed, true);
    assert.strictEqual(readBundle(outPath).secured, false);
    assert.deepStrictEqual((await decodeBundleRows(outPath))[0], {
      name: "tool",
      mnemonic: "TOOL01",
      alias: "alias-a",
      spec: "WNMG080408 UC5115",
    });

    const second = await mod.syncPriceBundle({ outputPath: outPath, runtime });
    assert.strictEqual(second.changed, true);
    assert.notStrictEqual(second.dataHash, first.dataHash, "search field changes should alter the data hash");
    assert.deepStrictEqual((await decodeBundleRows(outPath))[0], {
      name: "OSG Cutter",
      mnemonic: "OSG01",
      alias: "alias-b",
      spec: "WNMG080408 UC5115",
    });
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run()
  .then(() => {
    console.log("sync-price-name-roundtrip: OK");
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
