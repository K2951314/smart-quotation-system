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

  function getManifestMeta(source) {
    return source.manifestMeta || source.manifest || {};
  }

  function getBundleMeta(source) {
    if (source.bundleMeta || source.bundle) {
      return source.bundleMeta || source.bundle || {};
    }
    return source || {};
  }

  function pickPriceVersion(input) {
    var source = input || {};
    var manifestMeta = getManifestMeta(source);
    var bundleMeta = getBundleMeta(source);

    return (
      normalizeVersion(manifestMeta.updated_at) ||
      normalizeVersion(manifestMeta.content_updated_at) ||
      normalizeVersion(bundleMeta.generated_at) ||
      normalizeVersion(bundleMeta.version) ||
      "-"
    );
  }

  function pickStockVersion(input) {
    var source = input || {};
    var manifestMeta = getManifestMeta(source);
    var bundleMeta = getBundleMeta(source);

    return (
      normalizeVersion(manifestMeta.updated_at) ||
      normalizeVersion(manifestMeta.content_updated_at) ||
      normalizeVersion(bundleMeta.generated_at) ||
      normalizeVersion(bundleMeta.version) ||
      "-"
    );
  }

  return {
    normalizeVersion: normalizeVersion,
    pickPriceVersion: pickPriceVersion,
    pickStockVersion: pickStockVersion,
  };
});
