// utils/promptSpec.js
// Turn user form inputs into a normalized spec for prompt building.

const COLOR_THEMES = {
  "black_white": "black and white, high contrast",
  "warm": "warm palette (red/orange/warm tone), high contrast",
  "cool": "cool palette (blue/teal/aqua), high contrast",
  "neutrals": "minimalist neutrals (gray/beige/charcoal), high contrast",
  "pastel": "pastel palette (soft pink/mint/lavender), gentle contrast",
  "neon": "neon palette (electric blue/neon green/magenta), high impact",
  "metallic": "luxury metallic (gold/silver), premium finish (still vector)",
  "gradient": "smooth gradient (only if requested), clean and minimal",
};

const FONT_STYLES = {
  "geometric": "geometric sans, clean geometry",
  "humanist": "humanist sans, friendly modern",
  "grotesk": "grotesk sans, bold and neutral",
  "modern_serif": "modern serif, editorial premium",
  "classic_serif": "classic serif, timeless",
  "slab": "slab serif, sturdy",
  "rounded": "rounded sans, soft friendly",
  "script": "script/handwritten, elegant but readable",
  "tech": "tech/futuristic, sharp modern",
  "display": "display/decorative, distinctive but controlled",
  "bold": "bold heavy, strong presence",
  "thin": "minimal thin, delicate but still readable",
};

const INDUSTRY_BIASES = {
  "Fashion": "stylish, premium, modern retail-friendly",
  "Tech": "sleek, futuristic, innovative",
  "Health": "clean, calm, trustworthy, modern",
  "Food": "warm, appetizing, friendly",
  "Finance": "solid, reliable, professional",
  "Education": "clear, approachable, smart",
  "Sports": "dynamic, energetic, bold",
  "Beauty": "elegant, minimal, premium",
};

function normalizeText(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeBool(v, fallback = false) {
  if (v === true || v === false) return v;
  if (v == null) return fallback;

  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;

  return fallback;
}

function normalizeKeywords(v) {
  const s = normalizeText(v);
  if (!s) return "";
  // allow comma or newline separated
  return s
    .split(/[\n,]+/g)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(", ");
}

function resolveColorStyle(input) {
  const raw = normalizeText(input.color_style || input.color || "");
  if (!raw) {
    // if user provided checkbox-like theme key
    const themeKey = normalizeText(input.color_theme || "");
    if (themeKey && COLOR_THEMES[themeKey]) return COLOR_THEMES[themeKey];
    return "black and white, high contrast, 2 colors max";
  }
  // allow direct text like "black and white"
  return raw;
}

function resolveFontStyle(input) {
  const key = normalizeText(input.font_style || input.brand_font_style || "");
  if (!key) return "";
  return FONT_STYLES[key] || key; // accept raw if not mapped
}

function resolveTaglineStyle(input) {
  const key = normalizeText(input.tagline_font_style || "");
  if (!key) return "";
  // Keep simple; user can pass raw too
  return key;
}

function resolveIndustryBias(input) {
  const k = normalizeText(input.industry || "");
  if (!k) return "";
  return INDUSTRY_BIASES[k] || k;
}

function buildSpec(input = {}) {
  const brandName = normalizeText(input.brand_name || input.brand || "LOGOFUNNY");
  const logoType = normalizeText(input.logo_type || input.type || "letter").toLowerCase(); // letter | symbol | wordmark
  const letter = normalizeText(input.letter || "").slice(0, 2).toUpperCase(); // allow 1-2 chars
  const concept = normalizeText(input.concept || "");
  const tagline = normalizeText(input.tagline || input.brand_tagline || "");
  const keywords = normalizeKeywords(input.keywords || "");
  const notes = normalizeText(input.notes || input.additional_notes || "");
  const strictSafe = Boolean(input.strict_safe ?? input.strictSafe ?? false);

  const colorStyle = resolveColorStyle(input);
  const fontStyle = resolveFontStyle(input);
  const taglineStyle = resolveTaglineStyle(input);
  const industryBias = resolveIndustryBias(input);

  return {
    logo_type: logoType,
    brand_name: brandName,
    letter,
    concept,
    tagline,
    keywords,
    notes,
    color_style: colorStyle,
    font_style: fontStyle,
    tagline_style: taglineStyle,
    industry: normalizeText(input.industry || ""),
    industry_bias: industryBias,
    strict_safe: strictSafe,

    // NEW
    personality: normalizeText(input.personality || ""),
    layout: normalizeText(input.layout || ""),
    allow_gradient: normalizeBool(input.allow_gradient, false),
    max_colors: Number.isFinite(Number(input.max_colors)) ? Number(input.max_colors) : 2,
    stroke_weight: normalizeText(input.stroke_weight || ""),
    corner_style: normalizeText(input.corner_style || ""),
    use_cases: Array.isArray(input.use_cases) ? input.use_cases : [],
    avoid: Array.isArray(input.avoid) ? input.avoid : [],
  };
} 
module.exports = { buildSpec };