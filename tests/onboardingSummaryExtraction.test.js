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

const completeHistory = normalizeOnboardingInput({
  brand_name: "mamamiya",
  business_description: "宠物用品店，为新手养宠家庭提供日常用品。",
  rough_feeling: "温暖、活泼、有趣",
  conversation_language: "zh-CN",
  adaptive_answers: [
    { question: "你主要希望吸引谁？", answer: "刚开始养猫狗的年轻家庭。" },
    { question: "希望和同类品牌有什么不同？", answer: "少一点说教，多一点像懂宠物日常的朋友。" },
    { question: "Logo 最常出现在哪里？", answer: "包装、门店招牌和小红书主页。" },
    { question: "有什么要避免？", answer: "不要太幼稚，也不要使用爪印。" },
    { question: "还有什么补充？", answer: "图形和文字一起出现即可。" },
    { question: "第六条不应保留", answer: "This answer must be capped." },
  ],
});

assert.equal(completeHistory.adaptive_answers.length, 5);
assert.match(completeHistory.adaptive_answers[4].answer, /图形和文字/);
assert.doesNotMatch(completeHistory.adaptive_answers.map((item) => item.answer).join(" "), /capped/);

const richDraft = normalizeDirectionDraft({
  contract_version: "onboarding_direction_draft.v1",
  fields: {
    brand: userField("mamamiya"),
    business_context: userField(completeHistory.business_description),
    audience: userField("刚开始养猫狗的年轻家庭。"),
    how_it_should_feel: userField("温暖、活泼、有趣"),
    what_to_avoid: userField("不要太幼稚，也不要使用爪印。"),
    visual_style_leaning: userField("图形和文字一起出现。"),
    main_direction: userField("像懂宠物日常的朋友，适合包装、门店招牌和小红书主页。"),
  },
  ai_inferences: [],
}, completeHistory);

assert(richDraft);
assert.equal(richDraft.fields.brand.value, "mamamiya");
assert.match(richDraft.fields.audience.value, /年轻家庭/);
assert.match(richDraft.fields.main_direction.value, /包装、门店招牌/);

console.log("onboarding summary compound-field extraction: ok");
