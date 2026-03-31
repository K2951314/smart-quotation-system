(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DiscountUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var FALLBACK_DISCOUNT_PERCENT = 53;
  var OSG_DISCOUNT_PERCENT = 36;
  var EX_ACTIVITY_DISCOUNT_PERCENT = 32;
  var MIN_DISCOUNT_PERCENT = 0;
  var MAX_DISCOUNT_PERCENT = 100;
  var DEFAULT_STEP_PERCENT = 0.1;

  function toStringSafe(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundToTwo(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function normalizePercent(value, fallback) {
    var num = Number(value);
    if (!Number.isFinite(num)) num = Number(fallback);
    if (!Number.isFinite(num)) num = FALLBACK_DISCOUNT_PERCENT;
    return clamp(roundToTwo(num), MIN_DISCOUNT_PERCENT, MAX_DISCOUNT_PERCENT);
  }

  function sanitizeStepPercent(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return DEFAULT_STEP_PERCENT;
    return Math.max(DEFAULT_STEP_PERCENT, roundToTwo(num));
  }

  function compactText(value) {
    return toStringSafe(value).replace(/\s+/g, "");
  }

  function includesNormalized(haystack, needle) {
    return compactText(haystack).toUpperCase().indexOf(compactText(needle).toUpperCase()) >= 0;
  }

  function getDefaultDiscountPreset(item) {
    var source = item || {};
    var special = toStringSafe(source.special);
    var spec = toStringSafe(source.spec);

    if (includesNormalized(special, "EX活动")) {
      return {
        percent: EX_ACTIVITY_DISCOUNT_PERCENT,
        source: "ex-activity",
        label: "EX活动 32%",
      };
    }

    if (includesNormalized(spec, "OSG")) {
      return {
        percent: OSG_DISCOUNT_PERCENT,
        source: "osg",
        label: "OSG 36%",
      };
    }

    return {
      percent: FALLBACK_DISCOUNT_PERCENT,
      source: "fallback",
      label: "默认 53%",
    };
  }

  function getDefaultDiscountPercent(item) {
    return getDefaultDiscountPreset(item).percent;
  }

  function shiftDiscountPercent(currentPercent, stepPercent, direction) {
    var current = normalizePercent(currentPercent, FALLBACK_DISCOUNT_PERCENT);
    var step = sanitizeStepPercent(stepPercent);
    var dir = Number(direction) < 0 ? -1 : 1;
    return normalizePercent(current + step * dir, current);
  }

  function formatDiscountPercent(value) {
    return normalizePercent(value, FALLBACK_DISCOUNT_PERCENT)
      .toFixed(2)
      .replace(/\.?0+$/, "") + "%";
  }

  return {
    FALLBACK_DISCOUNT_PERCENT: FALLBACK_DISCOUNT_PERCENT,
    OSG_DISCOUNT_PERCENT: OSG_DISCOUNT_PERCENT,
    EX_ACTIVITY_DISCOUNT_PERCENT: EX_ACTIVITY_DISCOUNT_PERCENT,
    DEFAULT_STEP_PERCENT: DEFAULT_STEP_PERCENT,
    normalizePercent: normalizePercent,
    sanitizeStepPercent: sanitizeStepPercent,
    getDefaultDiscountPreset: getDefaultDiscountPreset,
    getDefaultDiscountPercent: getDefaultDiscountPercent,
    shiftDiscountPercent: shiftDiscountPercent,
    formatDiscountPercent: formatDiscountPercent,
  };
});
