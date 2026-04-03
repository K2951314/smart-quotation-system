(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RemoteSourceUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function normalizeDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === "string" && value.trim()) {
      var parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }

  function buildCacheBustUrl(url, cacheMode, nowValue) {
    var target = String(url || "").trim();
    if (!target) return "";

    var mode = String(cacheMode || "hourly").toLowerCase();
    var now = normalizeDate(nowValue);
    var key = String(now.getTime());

    if (mode === "hourly") {
      key = now.toISOString().slice(0, 13).replace(/[-:T]/g, "");
    } else if (mode === "daily") {
      key = now.toISOString().slice(0, 10).replace(/-/g, "");
    }

    var separator = target.indexOf("?") >= 0 ? "&" : "?";
    return target + separator + "v=" + encodeURIComponent(key);
  }

  function toRawGithubUrl(url) {
    var source = String(url || "").trim();
    var match = source.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(.+)$/i);
    if (!match) return "";
    return "https://raw.githubusercontent.com/" + match[1] + "/" + match[2] + "/" + match[3] + "/" + match[4];
  }

  function toJsDelivrUrl(url) {
    var source = String(url || "").trim();
    var match = source.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
    if (!match) return "";
    return "https://cdn.jsdelivr.net/gh/" + match[1] + "/" + match[2] + "@" + match[3] + "/" + match[4];
  }

  function pushUnique(list, value) {
    if (!value || list.indexOf(value) >= 0) return;
    list.push(value);
  }

  function getFetchCandidateUrls(url, options) {
    var source = String(url || "").trim();
    if (!source) return [];

    var opts = options || {};
    var preferRaw = String(opts.prefer || "").toLowerCase() === "raw";
    var includeJsDelivr = opts.includeJsDelivr !== false;
    var rawUrl = toRawGithubUrl(source);
    var jsdelivrUrl = includeJsDelivr ? toJsDelivrUrl(source) : "";
    var urls = [];

    if (preferRaw) {
      pushUnique(urls, rawUrl || (source.indexOf("https://raw.githubusercontent.com/") === 0 ? source : ""));
      pushUnique(urls, source);
      pushUnique(urls, jsdelivrUrl);
      return urls;
    }

    pushUnique(urls, source);
    pushUnique(urls, rawUrl);
    pushUnique(urls, jsdelivrUrl);
    return urls;
  }

  function getBundleCandidateUrls(url) {
    var primary = String(url || "").trim();
    if (!primary) return [];
    var urls = [primary];
    var rawUrl = toRawGithubUrl(primary);
    if (rawUrl && rawUrl !== primary) urls.push(rawUrl);
    return urls;
  }

  return {
    buildCacheBustUrl: buildCacheBustUrl,
    toRawGithubUrl: toRawGithubUrl,
    toJsDelivrUrl: toJsDelivrUrl,
    getFetchCandidateUrls: getFetchCandidateUrls,
    getBundleCandidateUrls: getBundleCandidateUrls,
  };
});
