// utils/promptEngine.js
// LogoFunny Prompt Engine v1.2 (A/B/C)
// A = wordmark, B = letter, C = symbol

const fs = require("fs");
const path = require("path");
const { buildSpec } = require("./promptSpec");

// B4 safe letters (internal)
const SAFE_B4 = new Set(["A", "M", "S", "L", "O", "R", "K", "N", "V", "T"]);

function loadPrompt(fileName) {
  const filePath = path.join(__dirname, "..", "prompts", fileName);
  return fs.readFileSync(filePath, "utf8");
}

function fill(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v ?? "");
  }
  return out;
}

function buildHardConstraints({ strict_safe, avoid = [], allow_gradient, max_colors }) {
  const safeMaxColors = Number.isFinite(max_colors)
    ? Math.min(Math.max(max_colors, 1), 6)
    : 2;
  const base = [
    "Output must be a clean vector logo (flat, minimal, no photo).",
    "No mockup, no texture, no 3D render, no lighting effects.",
    "Centered composition, balanced spacing, consistent stroke/geometry.",
    "High contrast and clarity at small sizes.",
    `Limit palette to ${safeMaxColors} colors max.`,
  ];

  // gradient control (soft rule)
  if (allow_gradient === false) {
    base.push("No gradients unless explicitly allowed.");
  }

  // avoid list -> hard rules (⚠️ gradient 不默认存在)
  const avoidMap = {
    animal: "Do not include animals or animal silhouettes.",
    face: "Do not include faces, eyes, or hidden facial forms.",
    photo: "Do not use photo-realistic elements.",
    mockup: "Do not render on mockups or products.",
    texture: "Do not use textures, grain, or noise.",
    "3d": "Do not use 3D effects, bevels, or perspective renders.",
    script: "Avoid script/handwritten lettering unless explicitly requested.",
    tiny_details: "Avoid tiny details; keep shapes bold and scalable.",
  };

  // ✅ 只有明确不允许渐变，才加入 hard avoid
  if (allow_gradient === false) {
    avoidMap.gradient = "Do not use gradients.";
  }

  // apply avoid rules
  avoid.forEach((k) => {
    const rule = avoidMap[k];
    if (rule) base.push(rule);
  });

  const strict = [
    "Avoid excessive abstraction; keep brand-relevant and legible.",
    "Do not introduce extra objects unless explicitly requested.",
  ];

  return strict_safe
    ? base.concat(strict).join("\n")
    : base.join("\n");
}

function buildDesignBrief(spec) {
  const lines = [];
  if (spec.industry_bias) lines.push(`Industry bias: ${spec.industry_bias}.`);
  if (spec.personality) lines.push(`Brand personality: ${spec.personality}.`);
  if (spec.layout) lines.push(`Layout preference: ${spec.layout}.`);
  if (spec.keywords) lines.push(`Keywords: ${spec.keywords}.`);
  // after keywords (line ~70)
  if (spec.allow_gradient != null) {
    lines.push(
    spec.allow_gradient
      ? "Gradients are allowed, but must remain subtle and logo-safe."
      : "Use flat solid colors only; avoid gradients."
    );
  }
  if (spec.font_style) lines.push(`Font style preference: ${spec.font_style}.`);
  if (spec.stroke_weight) lines.push(`Stroke weight: ${spec.stroke_weight}.`);
  if (spec.corner_style) lines.push(`Corner style: ${spec.corner_style}.`);
  if (spec.use_cases?.length) lines.push(`Use cases: ${spec.use_cases.join(", ")}.`);
  if (spec.tagline) {
    lines.push(`Tagline: "${spec.tagline}".`);
    if (spec.tagline_style) lines.push(`Tagline style: ${spec.tagline_style}.`);
  }
  if (spec.notes) lines.push(`Additional notes: ${spec.notes}.`);
  return lines.join("\n");
}

function buildPrompts(input = {}) {
  const spec = buildSpec(input);
  const colorStyle = spec.color_style || "black and white, high contrast, 2 colors max";
  const hard = buildHardConstraints(spec);
  const design_brief = buildDesignBrief(spec);
  
  // Route C: symbol
  if (spec.logo_type === "symbol") {
    const base = loadPrompt("symbol_base.txt");
    const magic = loadPrompt("symbol_magic.txt");

    const concept = spec.concept || spec.brand_name || "abstract modern symbol";
    const prompt = fill(base, {
      CONCEPT: concept,
      BRAND_NAME: spec.brand_name,
      COLOR_STYLE: colorStyle,
      DESIGN_BRIEF: design_brief,
      HARD_RULES: hard,
    });

    return {
      prompt,
      magic_prompt: magic + "\n\n" + design_brief + "\n\n" + hard,
      prompt_version: "C_symbol_v1.2",
      route: "C",
      logo_type: "symbol",
      brand_name: spec.brand_name,
      concept,
      strict_safe: spec.strict_safe,
    };
  }

  // Route A: wordmark (brand name)
  if (spec.logo_type === "wordmark") {
    const base = loadPrompt("wordmark_base.txt");
    const magic = loadPrompt("wordmark_magic.txt");

    const prompt = fill(base, {
      BRAND_NAME: spec.brand_name,
      TAGLINE: spec.tagline ? spec.tagline : "",
      COLOR_STYLE: colorStyle,
      DESIGN_BRIEF: design_brief,
      HARD_RULES: hard,
    });

    return {
      prompt,
      magic_prompt: magic + "\n\n" + design_brief + "\n\n" + hard,
      prompt_version: "A_wordmark_v1.2",
      route: "A",
      logo_type: "wordmark",
      brand_name: spec.brand_name,
      tagline: spec.tagline,
      strict_safe: spec.strict_safe,
    };
  }

  // Default Route B: letter
  const base = loadPrompt("letter_base.txt");
  const magic = loadPrompt("letter_magic.txt");
  const safe = loadPrompt("letter_safe_b4.txt");

  const letter = (spec.letter || spec.brand_name[0] || "A").toUpperCase();
  const useSafe = SAFE_B4.has(letter);
  const magicPrompt = useSafe
  ? (magic + "\n\n" + safe + "\n\n" + design_brief + "\n\n" + hard)
  : (magic + "\n\n" + design_brief + "\n\n" + hard);

  const prompt = fill(base, {
    LETTER: letter,
    BRAND_NAME: spec.brand_name,
    COLOR_STYLE: colorStyle,
    DESIGN_BRIEF: design_brief,
    HARD_RULES: hard,
  });

  return {
    prompt,
    magic_prompt: magicPrompt,
    prompt_version: "B_letter_v1.2",
    route: "B",
    logo_type: "letter",
    brand_name: spec.brand_name,
    letter,
    use_safe_b4: useSafe,
    strict_safe: spec.strict_safe,
  };
}

module.exports = { buildPrompts };