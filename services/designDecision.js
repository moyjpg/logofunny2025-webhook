/**
 * Rule-based design decision and brand insight from mapped user input.
 * No randomness; structure/layout/tone derived from industry and brand signals.
 */

const STRUCTURES = ["monogram", "symbol_wordmark", "wordmark", "emblem"];
const LAYOUTS = ["horizontal", "stacked", "centered"];
const TONES = ["modern_minimal", "bold_geometric", "refined"];

/**
 * @param {Object} mappedInput - mapped user input (brandName, industry, keywords, etc.)
 * @returns {{ structure: string, layout: string, tone: string }}
 */
function generateDesignDecision(mappedInput) {
  const brandName = (mappedInput?.brandName || "").trim();
  const industry = (mappedInput?.industry || "").toLowerCase();
  const nameLen = brandName.length;

  // A) Structure first (no keywordCount; tech/software/startup only for symbol_wordmark)
  let structure = "symbol_wordmark";
  if (nameLen <= 3 && nameLen > 0) {
    structure = "monogram";
  } else if (industry.includes("finance") || industry.includes("law") || industry.includes("legal")) {
    structure = "wordmark";
  } else if (industry.includes("luxury") || industry.includes("jewelry") || industry.includes("estate")) {
    structure = "emblem";
  } else if (industry.includes("tech") || industry.includes("software") || industry.includes("startup")) {
    structure = "symbol_wordmark";
  }
  // else: keep symbol_wordmark default

  // B) Tone second (industry-based)
  let tone = "modern_minimal";
  if (industry.includes("tech") || industry.includes("software") || industry.includes("startup")) {
    tone = "modern_minimal";
  } else if (industry.includes("fitness") || industry.includes("sport") || industry.includes("energy")) {
    tone = "bold_geometric";
  } else if (industry.includes("beauty") || industry.includes("fashion") || industry.includes("finance") || industry.includes("luxury")) {
    tone = "refined";
  }

  // C) Layout last (based on structure + tone)
  let layout = "horizontal";
  if (structure === "emblem") {
    layout = "stacked";
  } else if (structure === "monogram") {
    layout = "centered";
  } else if (tone === "refined") {
    layout = "horizontal";
  } else if (tone === "modern_minimal") {
    layout = "horizontal";
  } else if (tone === "bold_geometric") {
    layout = "stacked";
  }

  return { structure, layout, tone };
}

/**
 * Build a system-recommended prompt from designDecision and brandName only (no user style overrides).
 * @param {{ structure: string, layout: string, tone: string }} designDecision
 * @param {string} brandName
 * @returns {string}
 */
function buildPromptFromDesignDecision(designDecision, brandName) {
  const s = designDecision?.structure || "wordmark";
  const l = designDecision?.layout || "horizontal";
  const t = designDecision?.tone || "modern_minimal";
  const name = (brandName || "Brand").trim() ? `"${String(brandName).trim()}"` : "the brand";

  const structureDesc = {
    monogram: "monogram or lettermark, interlocking initials, no standalone icon",
    symbol_wordmark: "symbol plus wordmark, one clear icon with brand name",
    wordmark: "wordmark-only, typography-focused, no symbol",
    emblem: "emblem or badge style, contained shape with name",
  }[s] || "symbol with wordmark";

  const layoutDesc = {
    horizontal: "horizontal layout, icon left or right of text",
    stacked: "stacked layout, icon above or below text",
    centered: "centered, symmetrical composition",
  }[l] || "horizontal layout";

  const toneDesc = {
    modern_minimal: "modern minimal, clean lines, high legibility, scalable",
    bold_geometric: "bold geometric shapes, strong silhouette, confident",
    refined: "refined, elegant, premium feel, restrained detail",
  }[t] || "modern minimal";

  return [
    `Professional commercial logo for ${name}.`,
    `Structure: ${structureDesc}.`,
    `Layout: ${layoutDesc}.`,
    `Tone: ${toneDesc}.`,
    "Minimalist flat vector, suitable for trademark, no photo no 3D no illustration, no people mascots or scenes.",
  ].join(" ");
}

/**
 * Generate brand insight from designDecision only. Under 120 words, professional advisor tone.
 * @param {{ structure: string, layout: string, tone: string }} designDecision
 * @returns {string}
 */
function generateBrandInsight(designDecision) {
  if (!designDecision) return "";

  const s = designDecision.structure || "wordmark";
  const l = designDecision.layout || "horizontal";
  const t = designDecision.tone || "modern_minimal";

  const structureLabel = s.replace(/_/g, " ");
  const layoutLabel = l.replace(/_/g, " ");
  const toneLabel = t.replace(/_/g, " ");

  const parts = [
    `We recommend a ${structureLabel} structure with ${layoutLabel} layout and a ${toneLabel} tone for strong commercial use.`,
    `This combination supports scalability, clarity at small sizes, and a professional trademark-ready result.`,
  ];
  const text = parts.join(" ");
  const maxLen = 120 * 6; // ~120 words at ~6 chars/word
  return text.length <= maxLen ? text : text.slice(0, maxLen).replace(/\s+\S*$/, "") + ".";
}

module.exports = {
  generateDesignDecision,
  buildPromptFromDesignDecision,
  generateBrandInsight,
};
