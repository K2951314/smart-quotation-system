window.APP_CONFIG = {
  remotePrice: {
    enabled: true,
    manifestUrl: "https://cdn.jsdelivr.net/gh/K2951314/smart-quotation-system@data/price.bundle.XXXX.js",
    timeoutMs: 20000,
    cacheBust: "none",
  },
  remoteStock: {
    enabled: true,
    manifestUrl: "",
    url: "https://cdn.jsdelivr.net/gh/K2951314/smart-quotation-system@data/stock.bundle.XXXX.js",
    timeoutMs: 20000,
    cacheBust: "daily",
  },
  defaultDiscount: {
    enabled: true,
    url: "https://cdn.jsdelivr.net/gh/K2951314/smart-quotation-system@data/config.json",
    timeoutMs: 10000,
    cacheBust: "hourly",
  },
};
