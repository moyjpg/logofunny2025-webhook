"use strict";

const assert = require("node:assert/strict");
const {
  extractResearchResult,
  normalizeResearchInput,
} = require("../services/onboardingResearchService");

const normalized = normalizeResearchInput({
  brand_name: "  PHORK  ",
  business_description: " playful   kitchen tools ",
  rough_feeling: "clever, not childish",
  research_question: " compare similar products ",
  email: "must-not-pass@example.com",
  image: "must-not-pass",
});

assert.deepEqual(normalized, {
  brand_name: "PHORK",
  business_description: "playful kitchen tools",
  rough_feeling: "clever, not childish",
  research_question: "compare similar products",
});

const result = extractResearchResult({
  output: [
    {
      type: "web_search_call",
      action: {
        sources: [
          { type: "url", url: "https://example.com/category", title: "Category overview" },
        ],
      },
    },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "## Finding\nMost products lead with [utility](https://example.com/category?utm_source=openai); PHORK can own restrained humor.",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.com/category",
              title: "Category overview",
            },
            {
              type: "url_citation",
              url: "https://example.org/retail",
              title: "Retail examples",
            },
          ],
        },
      ],
    },
  ],
});

assert.equal(result.summary, "Finding Most products lead with utility; PHORK can own restrained humor.");
assert.deepEqual(result.sources, [
  { title: "Category overview", url: "https://example.com/category" },
  { title: "Retail examples", url: "https://example.org/retail" },
]);

assert.throws(
  () => extractResearchResult({ output_text: "Unsupported claim without sources." }),
  /public sources/
);

console.log("onboardingResearchService tests passed");
