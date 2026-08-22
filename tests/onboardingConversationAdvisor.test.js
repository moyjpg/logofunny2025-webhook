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

const normalized = normalizeAdvisorResponse({
  assistant_message: "The simple fork idea is memorable, but it could feel too literal.",
  ready_to_review: true,
  research: { offered: false, reason: "", confirmation_question: "" },
  questions: [
    {
      id: "first_impression",
      question: "What should people feel first?",
      reason: "Clarifies the emotional priority.",
      target_field: "rough_feeling",
    },
    {
      id: "second_question",
      question: "Who is it for?",
      reason: "Should be capped.",
      target_field: "audience",
    },
  ],
});

assert(normalized);
assert.equal(normalized.questions.length, 1);
assert.equal(normalized.ready_to_review, true);

console.log("onboarding conversation advisor checks passed");
