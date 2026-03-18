(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QueryRegex = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function toStringSafe(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function escapeRegexLiteral(text) {
    return toStringSafe(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function convertPlainLineToRegex(line) {
    var normalized = toStringSafe(line).trim();
    if (!normalized) return null;
    var parts = normalized.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    var pattern = parts.map(escapeRegexLiteral).join(".*");
    return new RegExp(pattern, "i");
  }

  function testRegex(re, value) {
    var flags = toStringSafe(re.flags).replace(/g/g, "");
    var safe = new RegExp(re.source, flags);
    return safe.test(toStringSafe(value));
  }

  function matchRegexTarget(spec, code, remark, re) {
    if (!(re instanceof RegExp)) throw new Error("re must be RegExp");
    var combined = [spec, code, remark].map(toStringSafe).join(" ");
    return (
      testRegex(re, combined) ||
      testRegex(re, spec) ||
      testRegex(re, code) ||
      testRegex(re, remark)
    );
  }

  function hasStockValue(stockText) {
    return !!toStringSafe(stockText).trim();
  }

  return {
    escapeRegexLiteral: escapeRegexLiteral,
    convertPlainLineToRegex: convertPlainLineToRegex,
    matchRegexTarget: matchRegexTarget,
    hasStockValue: hasStockValue,
  };
});
