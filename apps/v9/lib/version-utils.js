(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.VersionUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function normalizeVersion(value) {
    if (value === null || value === undefined) return "";
    var text = String(value).trim();
    return text || "";
  }

  function pickPriceVersion(input) {
    var source = input || {};
    var manifestMeta = source.manifestMeta || source.manifest || {};
    var bundleMeta = source.bundleMeta || source.bundle || {};

    return (
      normalizeVersion(manifestMeta.updated_at) ||
      normalizeVersion(bundleMeta.generated_at) ||
      normalizeVersion(bundleMeta.version) ||
      "-"
    );
  }

  function pickStockVersion(input) {
    var meta = input || {};

    return (
      normalizeVersion(meta.generated_at) ||
      normalizeVersion(meta.version) ||
      "-"
    );
  }

  return {
    normalizeVersion: normalizeVersion,
    pickPriceVersion: pickPriceVersion,
    pickStockVersion: pickStockVersion,
  };
});
