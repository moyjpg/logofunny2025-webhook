const fetch = require("node-fetch");

function buildIdeogramPrompt(input = {}) {
  const promptOverride = input?.promptOverride;
  if (typeof promptOverride === "string" && promptOverride.trim()) {
    return promptOverride.trim();
  }

  const brandName = String(input?.brandName || "Brand").trim();
  const industryRaw = String(input?.industry || "").trim();
  const industry = industryRaw.toLowerCase();
  const keywords = String(input?.keywords || "").trim();
  const colorTheme = Array.isArray(input?.colorTheme)
    ? input.colorTheme.join(", ").trim()
    : String(input?.colorTheme || "").trim();
  const brandFontStyle = String(input?.brandFontStyle || "").trim();
  const otherNotes = String(input?.otherNotes || input?.notes || "").trim();

  const logoStructure = String(input?.logoStructure || "").trim();
  const brandStyleRoute = String(input?.brandStyleRoute || "").trim();
  const visualMoodInput = input?.visualMood;
  const colorDirection = String(input?.colorDirection || "").trim();
  const typographyDirection = String(input?.typographyDirection || "").trim();
  const styleCuesRaw = input?.styleCues;
  const styleCues =
    typeof styleCuesRaw === "string"
      ? styleCuesRaw.trim()
      : styleCuesRaw != null
      ? String(styleCuesRaw).trim()
      : "";

  const VALID_ROUTES = new Set([
    "tech_saas",
    "beauty_premium",
    "studio_creative",
    "minimal_neutral",
    "bold_modern",
  ]);

  let route = "tech_saas";
  if (!VALID_ROUTES.has(brandStyleRoute)) {
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
  } else {
    route = brandStyleRoute;
  }

  let structureTag = "one compact abstract geometric mark and one readable wordmark";
  let layoutTag = "balanced horizontal or centered enterprise-grade lockup";
  let toneTag =
    "modern software brand, clean app icon feel, professional SaaS identity, distinctive but simple";
  let disciplineTag =
    "product-brand ready logo system, app-icon readability, strong small-size recognition, usable in monochrome";
  let typographyTag = "clean sans-serif or geometric typography, strong wordmark readability";

  if (route === "beauty_premium") {
    structureTag = "one refined standalone soft geometric symbol and one clean luxury wordmark";
    layoutTag = "elegant balanced centered composition or premium lockup";
    toneTag = "premium beauty identity, refined minimal luxury logo, soft geometric elegance";
    disciplineTag =
      "luxury brand system ready, clear premium spacing, usable in black and white, distinctive but restrained, high-end packaging friendly";
    typographyTag = "refined clean sans-serif typography with graceful spacing";
  } else if (route === "studio_creative") {
    structureTag =
      "one compact distinctive geometric visual mark and one readable editorial wordmark";
    layoutTag = "clear centered or horizontal composition with editorial hierarchy";
    toneTag = "creative studio identity, editorial geometric logo, design-forward but clean";
    disciplineTag =
      "design studio identity system, signature but usable logo, scalable brand mark, portfolio-ready identity, distinctive geometric structure";
    typographyTag = "editorial-inspired clean typography, highly readable";
  } else if (route === "minimal_neutral") {
    structureTag = "one calm abstract mark and one clear readable wordmark";
    layoutTag = "balanced horizontal or centered calm lockup";
    toneTag = "minimal neutral brand identity, calm restrained clarity, professional and simple";
    disciplineTag =
      "brand-ready system, small-size clarity, monochrome friendly, scalable compact mark";
    typographyTag = "clean minimal sans-serif typography, highly legible";
  } else if (route === "bold_modern") {
    structureTag = "one bold geometric mark and one strong readable wordmark";
    layoutTag = "confident horizontal or centered lockup";
    toneTag = "bold modern brand presence, confident geometric identity, memorable and clean";
    disciplineTag =
      "product-ready bold system, strong recognition, scalable mark, high-impact simplicity";
    typographyTag = "bold modern sans typography with strong readability";
  }

  const STRUCTURE_MAP = {
    symbol_wordmark: "one standalone brand symbol and one readable wordmark",
    wordmark_only: "one distinctive wordmark only, typography-led identity",
    monogram: "one compact monogram mark and one readable wordmark",
    badge: "one compact emblem-style brand mark with integrated wordmark",
  };
  if (logoStructure && STRUCTURE_MAP[logoStructure]) {
    structureTag = STRUCTURE_MAP[logoStructure];
    if (logoStructure === "wordmark_only") {
      layoutTag = "centered or horizontal typography-led lockup";
    } else if (logoStructure === "badge") {
      layoutTag = "compact emblem lockup with integrated wordmark";
    }
  }

  /** @type {Record<string, string>} */
  const TYPO_MAP = {
    clean_sans: "clean sans-serif wordmark typography, strong readability",
    geometric_sans: "geometric sans typography, crisp and modern",
    bold_modern: "bold modern sans typography, confident and clear",
    elegant_serif: "elegant refined serif-inspired typography, premium and readable",
    editorial_sans: "editorial clean sans typography, clear hierarchy",
    luxury_minimal: "luxury minimal refined typography, calm and premium",
  };
  if (typographyDirection && TYPO_MAP[typographyDirection]) {
    typographyTag = TYPO_MAP[typographyDirection];
  }
  if (brandFontStyle) {
    typographyTag = `${typographyTag} (preference hint: ${brandFontStyle}).`;
  }

  const MOOD_WORDS = {
    minimal: "minimal calm",
    premium: "premium refined",
    modern: "modern fresh",
    elegant: "elegant graceful",
    bold: "bold confident",
    soft: "soft gentle",
    geometric: "geometric structured",
    editorial: "editorial refined",
    friendly: "friendly approachable",
    structured: "structured systematic",
  };

  let moodTokens = [];
  if (Array.isArray(visualMoodInput)) {
    moodTokens = visualMoodInput.flatMap((m) => String(m).split(/[,;\s]+/));
  } else if (typeof visualMoodInput === "string" && visualMoodInput.trim()) {
    moodTokens = visualMoodInput.split(/[,;\s]+/);
  }
  const moodTag = (() => {
    const picked = moodTokens
      .map((t) => String(t).trim().toLowerCase())
      .filter((t) => MOOD_WORDS[t])
      .slice(0, 3)
      .map((t) => MOOD_WORDS[t]);
    return picked.length ? `Mood: ${picked.join(", ")}.` : "";
  })();

  let colorTag = "";
  if (colorTheme) {
    colorTag = `Color palette: ${colorTheme}.`;
  } else if (colorDirection === "custom") {
    colorTag = "Color direction: custom brand-appropriate palette.";
  } else {
    /** @type {Record<string, string>} */
    const CD_MAP = {
      black_white_first: "Color palette: monochrome-first, black and white friendly.",
      cool_tech: "Color palette: restrained cool tech tones.",
      warm_neutral: "Color palette: warm neutral balance.",
      soft_premium: "Color palette: soft premium restraint.",
      bold_contrast: "Color palette: bold clean contrast.",
      earthy_natural: "Color palette: earthy natural warmth.",
    };
    colorTag =
      CD_MAP[colorDirection] ||
      (route === "beauty_premium"
        ? "Color palette: restrained premium tones with soft contrast."
        : route === "studio_creative"
        ? "Color palette: restrained neutral tones with one controlled accent."
        : route === "minimal_neutral"
        ? "Color palette: subdued neutrals, black-and-white friendly."
        : route === "bold_modern"
        ? "Color palette: bold restrained palette with strong contrast."
        : "Color palette: restrained cool tones or black-and-white-first.");
  }

  const industryBaseTag =
    industryRaw && !industryRaw.match(/^[,.\s]+$/)
      ? `Industry context: ${industryRaw}.`
      : "";

  const styleCuesText = styleCues || keywords;
  const styleCuesTag = styleCuesText ? `Style cues: ${styleCuesText}.` : "";
  const notesTag = otherNotes ? `Art direction notes: ${otherNotes}.` : "";
  const exclusionTag = "No people, no scenes, no mascots, no extra decorative symbols.";

  return [
    `Commercial logo for "${brandName}".`,
    industryBaseTag,
    `${structureTag}.`,
    `${layoutTag}.`,
    `${toneTag}.`,
    `${disciplineTag}.`,
    `Typography: ${typographyTag}.`,
    moodTag,
    colorTag,
    styleCuesTag,
    notesTag,
    exclusionTag,
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

