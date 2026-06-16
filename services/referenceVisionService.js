"use strict";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION   = "2023-06-01";
const VISION_TIMEOUT_MS       = 15000;

const SAFE_SYSTEM_PROMPT = `You are a professional logo design analyst. Analyze the uploaded logo image and describe its visual design language in abstract, non-identifying terms only.

Rules:
- Do NOT mention any brand names, company names, trademarks, product names, or any readable text visible in the image.
- Do NOT say "copy", "reproduce", "imitate", or reference any specific brand or company.
- DO describe only observable visual attributes: shape language, composition structure, color qualities, icon or mascot feel, typography feel, and detail level.
- detailLevel must be exactly one of: "minimal", "balanced", or "refined".

Return ONLY a valid JSON object — no markdown, no code fences, no explanation:
{
  "shapeLanguage": "...",
  "composition": "...",
  "colorPalette": "...",
  "iconFeel": "...",
  "typographyFeel": "...",
  "detailLevel": "minimal" | "balanced" | "refined",
  "styleDescription": "...",
  "safePromptFragment": "..."
}

safePromptFragment: 2–3 focused sentences, 40–90 words total. Cover: (1) the abstract mark construction and geometry, (2) the composition structure and any notable negative space or layout, (3) the overall visual weight, finish level, and style feel. No brand names, no trademarks, no copied artwork, no reference to specific companies, products, or distinctive proprietary details. Must begin with "Logo with" or "A logo featuring".`;

const VALID_DETAIL_LEVELS = new Set(["minimal", "balanced", "refined"]);

/**
 * Call the Anthropic Messages API with a hard timeout via AbortController.
 * @param {object} body
 * @param {string} apiKey
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(body, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  return fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify(body),
  }).finally(() => clearTimeout(timer));
}

/**
 * Validate that the parsed object has the minimum required fields.
 * @param {unknown} obj
 * @returns {boolean}
 */
function validateAnalysis(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const safeFragment = obj.safePromptFragment;
  const styleDesc    = obj.styleDescription;
  return (
    typeof safeFragment === "string" && safeFragment.trim().length > 0 &&
    typeof styleDesc    === "string" && styleDesc.trim().length > 0
  );
}

/**
 * Analyze a reference image buffer using a Claude vision model.
 * Always returns ReferenceAnalysis | null — never throws.
 *
 * @param {Buffer} buffer
 * @param {string} mimetype  e.g. "image/png"
 * @returns {Promise<ReferenceAnalysis|null>}
 *
 * @typedef {{
 *   shapeLanguage: string,
 *   composition: string,
 *   colorPalette: string,
 *   iconFeel: string,
 *   typographyFeel: string,
 *   detailLevel: "minimal"|"balanced"|"refined",
 *   styleDescription: string,
 *   safePromptFragment: string,
 * }} ReferenceAnalysis
 */
async function analyzeReferenceImage(buffer, mimetype) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("[vision] ANTHROPIC_API_KEY not set; skipping reference analysis");
      return null;
    }

    const model = process.env.REFERENCE_VISION_MODEL;
    if (!model) {
      console.log("[vision] REFERENCE_VISION_MODEL not set; skipping reference analysis");
      return null;
    }

    const mediaType  = mimetype || "image/png";
    const base64Data = buffer.toString("base64");

    const requestBody = {
      model,
      max_tokens: 512,
      system: SAFE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: "Analyze this logo image and return the JSON object as described in the system prompt. Return only the JSON — no markdown, no code fences.",
            },
          ],
        },
      ],
    };

    const res = await fetchWithTimeout(requestBody, apiKey);

    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      console.warn(`[vision] Anthropic API error ${res.status}:`, snippet.slice(0, 160));
      return null;
    }

    const data    = await res.json();
    const rawText = (data?.content?.[0]?.text ?? "").trim();

    let parsed;
    try {
      // Strip optional markdown code fences defensively
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/,           "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn("[vision] Failed to parse JSON from vision response:", rawText.slice(0, 200));
      return null;
    }

    if (!validateAnalysis(parsed)) {
      console.warn("[vision] Vision response missing required fields");
      return null;
    }

    const detailLevel = VALID_DETAIL_LEVELS.has(parsed.detailLevel)
      ? parsed.detailLevel
      : "balanced";

    return {
      shapeLanguage:      typeof parsed.shapeLanguage   === "string" ? parsed.shapeLanguage.trim()   : "",
      composition:        typeof parsed.composition     === "string" ? parsed.composition.trim()     : "",
      colorPalette:       typeof parsed.colorPalette    === "string" ? parsed.colorPalette.trim()    : "",
      iconFeel:           typeof parsed.iconFeel        === "string" ? parsed.iconFeel.trim()        : "",
      typographyFeel:     typeof parsed.typographyFeel  === "string" ? parsed.typographyFeel.trim()  : "",
      detailLevel,
      styleDescription:   typeof parsed.styleDescription  === "string" ? parsed.styleDescription.trim()  : "",
      safePromptFragment: typeof parsed.safePromptFragment === "string" ? parsed.safePromptFragment.trim() : "",
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      console.warn(`[vision] analyzeReferenceImage timeout after ${VISION_TIMEOUT_MS}ms`);
    } else {
      const detail = err?.status ? ` (status ${err.status})` : "";
      console.warn(`[vision] analyzeReferenceImage error${detail}:`, err?.message || String(err));
    }
    return null;
  }
}

module.exports = { analyzeReferenceImage };
