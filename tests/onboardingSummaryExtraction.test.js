const assert = require("node:assert/strict");

const {
  normalizeOnboardingInput,
  normalizeDirectionDraft,
} = require("../services/onboardingSummaryService");

const input = normalizeOnboardingInput({
  brand_name: "MORI",
  business_description: "我们是一家社区咖啡店，希望赶时间的邻居也感到放松。",
  rough_feeling: "同意温暖熟悉、安静清爽的方向。名字和独立小图形一起出现，图形用一片简洁的叶子，深绿色，白底。不要咖啡杯、盾牌、标语或注册商标符号。",
  conversation_language: "zh-CN",
});

const userField = (value) => ({
  value,
  source: "user",
  inference_id: null,
  confidence: null,
});

const nullField = () => ({
  value: null,
  source: null,
  inference_id: null,
  confidence: null,
});

const draft = normalizeDirectionDraft({
  contract_version: "onboarding_direction_draft.v1",
  fields: {
    brand: userField("MORI"),
    business_context: userField(input.business_description),
    audience: nullField(),
    how_it_should_feel: userField("温暖熟悉、安静清爽"),
    what_to_avoid: userField("咖啡杯、盾牌、标语、注册商标符号"),
    visual_style_leaning: nullField(),
    main_direction: userField("MORI 与一片简洁的深绿色叶子图形一起出现在白底上"),
  },
  ai_inferences: [],
}, input);

assert(draft);
assert.equal(draft.fields.how_it_should_feel.value, "温暖熟悉、安静清爽");
assert.equal(draft.fields.how_it_should_feel.source, "user");
assert.equal(draft.fields.what_to_avoid.value, "咖啡杯、盾牌、标语、注册商标符号");
assert.match(draft.fields.main_direction.value, /深绿色叶子/);

console.log("onboarding summary compound-field extraction: ok");
