const assert = require("assert");
const {
  buildFallbackAdvisorResponse,
  normalizeAdvisorResponse,
} = require("../services/onboardingFollowupService");

const visualIdea = buildFallbackAdvisorResponse({
  brand_name: "OOPTRA",
  business_description: "An online shop selling kitchen tools",
  rough_feeling: "friendly and clever",
  latest_message: "I think the logo could look like a fork, but not too obvious.",
});

assert.equal(visualIdea.source, "deterministic_fallback");
assert.equal(visualIdea.research.offered, false);
assert.match(visualIdea.assistant_message, /memorable brand cue/i);
assert.match(visualIdea.assistant_message, /literal symbol/i);
assert(!/^got it/i.test(visualIdea.assistant_message));

const research = buildFallbackAdvisorResponse({
  latest_message: "如有必要，我可以在网上搜索类似产品进行分析和总结吗？",
});

assert.equal(research.research.offered, true);
assert.match(research.assistant_message, /还没有开始搜索/);
assert.match(research.assistant_message, /公开网站/);

const spanish = buildFallbackAdvisorResponse({
  brand_name: "NORTE",
  latest_message: "Quiero una marca clara y cercana.",
  conversation_language: "es",
});
assert.match(spanish.assistant_message, /marca/i);
assert.match(spanish.assistant_message, /\?/);

const japaneseResearch = buildFallbackAdvisorResponse({
  brand_name: "MORI",
  latest_message: "類似製品を調査できますか？",
  conversation_language: "ja",
});
assert.equal(japaneseResearch.research.offered, true);
assert.match(japaneseResearch.assistant_message, /まだ検索/);

const completeReadiness = {
  business: { status: "covered", evidence: "Kitchen-tools shop" },
  audience: { status: "covered", evidence: "Home cooks" },
  differentiation: { status: "covered", evidence: "Practical tools with a clever twist" },
  personality: { status: "covered", evidence: "Friendly and clever" },
  logo_context: { status: "intentionally_open", evidence: "User asked for a recommendation" },
};

const normalized = normalizeAdvisorResponse({
  assistant_message: "The simple fork idea is memorable, but it could feel too literal.",
  ready_to_review: true,
  readiness: completeReadiness,
  research: { offered: false, reason: "", confirmation_question: "" },
  questions: [
    {
      id: "visual_context",
      question: "Where will people see this logo most often?",
      reason: "Clarifies the real-world use context.",
      target_field: "other",
    },
    {
      id: "second_question",
      question: "Who is it for?",
      reason: "Should be capped.",
      target_field: "audience",
    },
  ],
}, {
  business_description: "Kitchen-tools shop",
  rough_feeling: "Friendly and clever",
  latest_message: "We make kitchen tools for home cooks who want practical tools unlike generic options.",
  primary_use: "packaging",
});

assert(normalized);
assert.equal(normalized.questions.length, 1);
assert.equal(normalized.ready_to_review, true);

const sparse = normalizeAdvisorResponse({
  assistant_message: "Mamamiya already has a warm, playful starting point.",
  ready_to_review: true,
  readiness: {
    business: { status: "covered", evidence: "Pet-supplies shop" },
    audience: { status: "missing", evidence: "" },
    differentiation: { status: "missing", evidence: "" },
    personality: { status: "covered", evidence: "Warm, playful and fun" },
    logo_context: { status: "missing", evidence: "Graphic plus text is a format, not a use context" },
  },
  research: { offered: false, reason: "", confirmation_question: "" },
  questions: [],
}, {
  brand_name: "mamamiya",
  business_description: "宠物用品店",
  rough_feeling: "温暖、活泼、有趣",
  conversation_language: "zh-CN",
});

assert(sparse);
assert.equal(sparse.ready_to_review, false);
assert.equal(sparse.questions.length, 1);
assert.equal(sparse.questions[0].id, "clarify_audience");
assert.match(sparse.questions[0].question, /哪一类人/);

const genericAudience = normalizeAdvisorResponse({
  assistant_message: "Mamamiya has a friendly starting point.",
  ready_to_review: true,
  readiness: {
    business: { status: "covered", evidence: "Pet-supplies shop" },
    audience: { status: "covered", evidence: "People who buy pet supplies" },
    differentiation: { status: "covered", evidence: "Warm and playful" },
    personality: { status: "covered", evidence: "Warm and playful" },
    logo_context: { status: "covered", evidence: "Graphic plus text" },
  },
  research: { offered: false, reason: "", confirmation_question: "" },
  questions: [],
}, {
  brand_name: "mamamiya",
  business_description: "宠物用品店",
  rough_feeling: "温暖、活泼、有趣",
  latest_message: "我开一家宠物用品店，品牌叫 mamamiya，希望温暖、活泼、有趣，Logo 想要图形加文字。",
  conversation_language: "zh-CN",
});

assert(genericAudience);
assert.equal(genericAudience.ready_to_review, false);
assert.equal(genericAudience.readiness.audience.status, "missing");
assert.equal(genericAudience.readiness.differentiation.status, "missing");
assert.equal(genericAudience.readiness.logo_context.status, "missing");

const naturalAudience = normalizeAdvisorResponse({
  assistant_message: "That audience gives the direction useful focus.",
  ready_to_review: false,
  readiness: {
    business: { status: "covered", evidence: "Pet-supplies shop" },
    audience: { status: "covered", evidence: "Young pet-owning families" },
    differentiation: { status: "missing", evidence: "" },
    personality: { status: "covered", evidence: "Warm and playful" },
    logo_context: { status: "missing", evidence: "" },
  },
  research: { offered: false, reason: "", confirmation_question: "" },
  questions: [{ id: "logo_use_context", question: "Where will people see the logo first?", reason: "Clarifies use.", target_field: "other" }],
}, {
  business_description: "宠物用品店",
  rough_feeling: "温暖、活泼、有趣",
  latest_message: "主要是把宠物当家人、想挑到实用又有一点设计感日常用品的年轻养宠家庭。",
  conversation_language: "zh-CN",
});

assert(naturalAudience);
assert.equal(naturalAudience.readiness.audience.status, "covered");

console.log("onboarding conversation advisor checks passed");
