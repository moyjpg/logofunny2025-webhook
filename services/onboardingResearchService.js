"use strict";

// Public-web research for the onboarding brand conversation.
//
// This service is intentionally separate from the free conversation model.
// It runs only after the product has collected an explicit end-user click in
// the authenticated frontend route. It never receives account, payment, or
// uploaded-image data.

const fetch = require("node-fetch");

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_SOURCES = 8;

function getResearchConfig() {
  const enabled = String(process.env.ONBOARDING_RESEARCH_ENABLED || "").toLowerCase() === "true";
  const timeout = Number.parseInt(process.env.ONBOARDING_RESEARCH_FETCH_TIMEOUT_MS || "", 10);
  return {
    enabled,
    apiKey: process.env.ONBOARDING_RESEARCH_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.ONBOARDING_RESEARCH_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.ONBOARDING_RESEARCH_MODEL || "gpt-5.6-luna",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

function isResearchConfigured(config) {
  return Boolean(config?.enabled && config?.apiKey && config?.baseUrl && config?.model);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanResearchSummary(value) {
  return cleanText(
    String(value || "")
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
      .replace(/(^|\s)#{1,6}\s+/g, "$1"),
    8_000
  );
}

function normalizeResearchInput(raw = {}) {
  return {
    brand_name: cleanText(raw.brand_name, 120),
    business_description: cleanText(raw.business_description, 2_000),
    rough_feeling: cleanText(raw.rough_feeling, 500),
    research_question: cleanText(raw.research_question, 1_000),
  };
}

function buildResearchPrompt(input) {
  return `You are LogoFunny's public-web brand researcher. Research the user's question using current, publicly accessible web sources.

Brand name: ${input.brand_name || "Not named yet"}
What they are building: ${input.business_description}
Desired feeling: ${input.rough_feeling || "Not specified"}
Research question: ${input.research_question}

Return a concise, useful answer for an ordinary founder:
- Lead with 3-5 evidence-backed findings.
- Separate repeated category patterns from opportunities to feel different.
- Give 2 practical recommendations for the brand direction.
- Mention uncertainty or thin evidence plainly.
- Do not claim legal clearance, trademark availability, customer demand, or market size unless directly supported.
- Do not mention private data or uploaded images; none were provided.
- Use only findings supported by the public sources you actually opened.
- Keep the answer under 650 words and match the language of the research question.`;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.searchParams.delete("utm_source");
    return url.toString();
  } catch {
    return "";
  }
}

function extractResearchResult(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const textParts = [];
  const sourceMap = new Map();

  const addSource = (urlValue, titleValue) => {
    const url = safeHttpUrl(urlValue);
    if (!url || sourceMap.has(url) || sourceMap.size >= MAX_SOURCES) return;
    const title = cleanText(titleValue, 180) || new URL(url).hostname.replace(/^www\./, "");
    sourceMap.set(url, { title, url });
  };

  // Citation annotations are the sources directly attached to claims in the
  // answer, so collect them before the broader tool-call source list.
  for (const item of output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content?.type === "output_text" && typeof content.text === "string") {
          textParts.push(content.text.trim());
        }
        if (Array.isArray(content?.annotations)) {
          for (const annotation of content.annotations) {
            if (annotation?.type === "url_citation") {
              addSource(annotation.url, annotation.title);
            }
          }
        }
      }
    }
  }

  // Fill any remaining slots with public pages the web-search call consulted.
  for (const item of output) {
    if (item?.type === "web_search_call" && Array.isArray(item?.action?.sources)) {
      for (const source of item.action.sources) {
        addSource(source?.url, source?.title);
      }
    }
  }

  // Links live in the structured source list below the answer. Remove inline
  // Markdown URLs so the chat stays readable without rendering provider HTML.
  const summary = cleanResearchSummary(textParts.join("\n\n") || response?.output_text);
  const sources = Array.from(sourceMap.values());
  if (!summary) throw new Error("Research response did not contain an answer.");
  if (sources.length === 0) throw new Error("Research response did not contain public sources.");

  return { summary, sources };
}

async function runOnboardingResearch(rawInput) {
  const input = normalizeResearchInput(rawInput);
  if (!input.business_description || !input.research_question) {
    throw new Error("business_description and research_question are required.");
  }

  const config = getResearchConfig();
  if (!isResearchConfigured(config)) {
    const error = new Error("Public research is not configured.");
    error.code = "RESEARCH_NOT_CONFIGURED";
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        input: buildResearchPrompt(input),
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        max_tool_calls: 8,
        max_output_tokens: 1_800,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    if (!response.ok || !json) {
      const message = cleanText(json?.error?.message || raw, 500) || `OpenAI research failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    const result = extractResearchResult(json);
    return {
      ...result,
      model: cleanText(json.model || config.model, 120),
      response_id: cleanText(json.id, 180),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  extractResearchResult,
  getResearchConfig,
  isResearchConfigured,
  normalizeResearchInput,
  runOnboardingResearch,
};
