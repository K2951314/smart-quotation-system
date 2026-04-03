import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INPUT = "apps/v9/stock.bundle.js";
const DEFAULT_OUTPUT_ROOT = "apps/v9";
const RELATIVE_LATEST = "stock.bundle.js";

function resolveFromRoot(inputPath) {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.join(ROOT_DIR, inputPath);
}

function parseArgs(argv) {
  const out = {
    input: DEFAULT_INPUT,
    outputRoot: DEFAULT_OUTPUT_ROOT,
  };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--input" && args[i + 1]) out.input = args[++i];
    else if (arg === "--output-root" && args[i + 1]) out.outputRoot = args[++i];
  }
  return out;
}

function hashBytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function stableManifestJson(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function resolveIsoTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function pickContentUpdatedAt(existingManifest, nowIso) {
  if (!existingManifest || typeof existingManifest !== "object") return nowIso;
  return resolveIsoTimestamp(
    existingManifest.content_updated_at || existingManifest.updated_at || nowIso,
  );
}

async function readJsonSafe(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    return null;
  }
}

async function readTextSafe(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return "";
    throw err;
  }
}

export async function publishStockBundle(options) {
  const opts = options || {};
  const inputPath = resolveFromRoot(opts.input || DEFAULT_INPUT);
  const outputRoot = resolveFromRoot(opts.outputRoot || DEFAULT_OUTPUT_ROOT);

  const inputBytes = await readFile(inputPath);
  const inputText = inputBytes.toString("utf8");
  const hash = hashBytes(inputBytes);
  const latestPath = path.join(outputRoot, RELATIVE_LATEST);
  const manifestPath = path.join(outputRoot, "stock-manifest.json");
  const nowIso = resolveIsoTimestamp(opts.now);

  const existingManifest = await readJsonSafe(manifestPath);
  const existingManifestText = await readTextSafe(manifestPath);
  const existingLatestText = await readTextSafe(latestPath);

  const contentChanged = !(
    existingManifest &&
    existingManifest.hash === hash &&
    String(existingManifest.latest || "") === RELATIVE_LATEST &&
    existingLatestText === inputText
  );

  if (contentChanged) {
    await mkdir(outputRoot, { recursive: true });
    await writeFile(latestPath, inputBytes);
  }

  const manifest = {
    latest: RELATIVE_LATEST,
    hash,
    updated_at: nowIso,
    content_updated_at: contentChanged
      ? nowIso
      : pickContentUpdatedAt(existingManifest, nowIso),
  };
  const manifestText = stableManifestJson(manifest);
  const manifestChanged = manifestText !== existingManifestText;

  if (manifestChanged) {
    await mkdir(outputRoot, { recursive: true });
    await writeFile(manifestPath, manifestText, "utf8");
  }

  return {
    changed: contentChanged || manifestChanged,
    contentChanged,
    manifestChanged,
    hash,
    latest: RELATIVE_LATEST,
    manifestPath,
    bundlePath: latestPath,
    updatedAt: manifest.updated_at,
    contentUpdatedAt: manifest.content_updated_at,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  publishStockBundle(args)
    .then((res) => {
      const contentState = res.contentChanged ? "updated" : "unchanged";
      const manifestState = res.manifestChanged ? "updated" : "unchanged";
      console.log(
        `[publish-stock] content=${contentState} manifest=${manifestState} hash=${res.hash} latest=${res.latest} manifest_path=${res.manifestPath}`,
      );
    })
    .catch((err) => {
      console.error(`[publish-stock] failed: ${err.message}`);
      process.exit(1);
    });
}
