window.APP_CONFIG = {
  remotePrice: {
    enabled: true,
    manifestUrl: "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/price-manifest.json",
    timeoutMs: 8000,
    cacheBust: "request",
  },
  remoteStock: {
    enabled: true,
    manifestUrl: "",
    url: "https://raw.githubusercontent.com/K2951314/-/stock-data/apps/v9/stock.bundle.js",
    timeoutMs: 8000,
    cacheBust: "daily",
  },
  defaultDiscount: {
    enabled: true,
    url: "https://raw.githubusercontent.com/K2951314/-/main/apps/v9/default-discount.json",
    timeoutMs: 4000,
    cacheBust: "hourly",
  },
};
