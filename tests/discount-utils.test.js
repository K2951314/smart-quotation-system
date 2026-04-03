const test = require("node:test");
const assert = require("node:assert/strict");

const DiscountUtils = require("../apps/v9/lib/discount-utils.js");

test("name exactly 刀具 is classified as mitsubishi", () => {
  const category = DiscountUtils.getDiscountCategory({
    name: "刀具",
    brand: "",
    spec: "",
    special: "",
  });

  assert.equal(category, "mitsubishi");
});

test("mitsubishi and other fall back to 55 percent", () => {
  const config = DiscountUtils.sanitizeDiscountConfig({});

  assert.equal(config.mitsubishi, 55);
  assert.equal(config.other, 55);
});
