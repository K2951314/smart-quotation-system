const test = require("node:test");
const assert = require("node:assert/strict");

const DiscountUtils = require("../apps/v9/lib/discount-utils.js");

test("名称列为刀具时归类为三菱默认折扣", () => {
  const category = DiscountUtils.getDiscountCategory({
    name: "刀具",
    brand: "",
    spec: "",
    special: "",
  });

  assert.equal(category, "mitsubishi");
});

test("三菱和其他默认值回退为55", () => {
  const config = DiscountUtils.sanitizeDiscountConfig({});

  assert.equal(config.mitsubishi, 55);
  assert.equal(config.other, 55);
});
