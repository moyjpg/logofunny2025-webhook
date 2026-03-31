const fetch = require("node-fetch");

function buildIdeogramPrompt(input = {}) {
  const promptOverride = input?.promptOverride;
  if (typeof promptOverride === "string" && promptOverride.trim()) {
    return promptOverride.trim();
  }

  const brandName = String(input?.brandName || "Brand").trim();
  const industry = String(input?.industry || "").trim().toLowerCase();
  const keywords = String(input?.keywords || "").trim();
  const colorTheme = Array.isArray(input?.colorTheme)
    ? input.colorTheme.join(", ").trim()
    : String(input?.colorTheme || "").trim();
  const brandFontStyle = String(input?.brandFontStyle || "").trim();
  const otherNotes = String(input?.otherNotes || input?.notes || "").trim();

  // Route selection for LogoFunny V1
  let route = "tech_saas";
  if (
    industry.includes("beauty") ||
    industry.includes("skincare") ||
    industry.includes("fashion") ||
    industry.includes("jewelry") ||
    industry.includes("luxury") ||
    industry.includes("cosmetics")
  ) {
    route = "beauty_premium";
  } else if (
    industry.includes("studio") ||
    industry.includes("creative") ||
    industry.includes("design") ||
    industry.includes("agency") ||
    industry.includes("branding") ||
    industry.includes("art")
  ) {
    route = "studio_creative";
  } else if (
    industry.includes("tech") ||
    industry.includes("technology") ||
    industry.includes("software") ||
    industry.includes("saas") ||
    industry.includes("startup") ||
    industry.includes("app")
  ) {
    route = "tech_saas";
  }

  let structureTag = "one compact abstract geometric mark and one readable wordmark";
  let layoutTag = "balanced horizontal or centered enterprise-grade lockup";
  let toneTag = "modern software brand, clean app icon feel, professional SaaS identity, distinctive but simple";
  let disciplineTag = "product-brand ready logo system, app-icon readability, strong small-size recognition, usable in monochrome";
  let typographyTag = "clean sans-serif or geometric typography, strong wordmark readability";
  let colorTag = colorTheme
    ? `Color palette: ${colorTheme}.`
    : "Color palette: restrained cool tones or black-and-white-first.";

  if (route === "beauty_premium") {
    structureTag = "one refined standalone soft geometric symbol and one clean luxury wordmark";
    layoutTag = "elegant balanced centered composition or premium lockup";
    toneTag = "premium beauty identity, refined minimal luxury logo, soft geometric elegance";
    disciplineTag = "luxury brand system ready, clear premium spacing, usable in black and white, distinctive but restrained, high-end packaging friendly";
    typographyTag = "refined clean sans-serif typography with graceful spacing";
    colorTag = colorTheme
      ? `Color palette: ${colorTheme}.`
      : "Color palette: restrained premium tones with soft contrast.";
  } else if (route === "studio_creative") {
    structureTag = "one compact distinctive geometric visual mark and one readable editorial wordmark";
    layoutTag = "clear centered or horizontal composition with editorial hierarchy";
    toneTag = "creative studio identity, editorial geometric logo, design-forward but clean";
    disciplineTag = "design studio identity system, signature but usable logo, scalable brand mark, portfolio-ready identity, distinctive geometric structure";
    typographyTag = "editorial-inspired clean typography, highly readable";
    colorTag = colorTheme
      ? `Color palette: ${colorTheme}.`
      : "Color palette: restrained neutral tones with one controlled accent.";
  }

  if (brandFontStyle) {
    typographyTag = `${typographyTag}; font preference: ${brandFontStyle}`;
  }

  const keywordsTag = keywords ? `Brand cues: ${keywords}.` : "";
  const notesTag = otherNotes ? `Art direction notes: ${otherNotes}.` : "";
  const exclusionTag = "No people, no scenes, no mascots, no extra decorative symbols.";

  return [
    `Commercial logo for "${brandName}".`,
    `${structureTag}.`,
    `${layoutTag}.`,
    `${toneTag}.`,
    `${disciplineTag}.`,
    `Typography: ${typographyTag}.`,
    colorTag,
    keywordsTag,
    notesTag,
    exclusionTag
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateIdeogramLogos(input = {}) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing IDEOGRAM_API_KEY in env");
  }

  const prompt = buildIdeogramPrompt(input);

  const response = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      // Request 4 concepts to match the required normalization contract.
      num_images: 4,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ideogram API error ${response.status}: ${detail || "no details"}`);
  }

  const data = await response.json();
  const raw =
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.results) && data.results) ||
    [];

  const imageUrls = raw
    .map((item) => item?.url || item?.image_url || item?.imageUrl || item?.image?.url)
    .filter((u) => typeof u === "string" && u.trim());

  if (imageUrls.length < 4) {
    throw new Error(`Ideogram returned ${imageUrls.length} images, expected 4`);
  }

  return imageUrls.slice(0, 4).map((imageUrl) => ({
    imageUrl,
    prompt,
    model: "ideogram",
    mode: "text-to-image",
  }));
}

module.exports = {
  generateIdeogramLogos,
};

