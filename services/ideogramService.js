const fetch = require("node-fetch");

// Two group art directions — each group generates 2 sibling outputs (2+2 = 4 total).
// Group 0: typography-forward (wordmark + symbol). Group 1: mark-led (icon or monogram).
const GROUP_DIRECTIONS = [
  {
    label: "wordmark_symbol",
    structureOverride:
      "one clean wordmark paired with a simple geometric symbol mark, symbol positioned beside or above wordmark, typography is the hero element",
    layoutOverride:
      "balanced horizontal or centered lockup with clear wordmark dominance and generous whitespace",
    artNote:
      "Typography-forward identity. Wordmark clarity is the primary goal. Geometric mark is subtle and secondary. The 2 outputs in this group should be siblings — sharing this horizontal wordmark-led composition but each offering distinct variation in mark geometry or visual weight. Not duplicates.",
  },
  {
    label: "icon_monogram",
    structureOverride:
      "Prefer a distinct abstract or concept-driven symbol derived from the brand idea. Avoid defaulting to a plain initial, generic letter mark, or simple monogram unless the user's selected logo structure, icon direction, industry context, or brief clearly asks for a lettermark, initials, monogram, portrait/avatar, mascot, or animal form. Keep the mark paired with a readable wordmark.",
    layoutOverride:
      "stacked vertical composition: standalone icon or monogram mark centered prominently on top, clean brand name wordmark centered below with clear visual separation — icon-over-text hierarchy, not a horizontal wordmark arrangement",
    artNote:
      "Icon-led identity. The mark must be a fully independent graphic element — an abstract icon, geometric symbol, or bold monogram — that exists above the wordmark, not inside it. Do not replace a letter in the wordmark with an icon or shape. The icon and wordmark are two distinct separate elements in a stacked layout. The 2 outputs in this group should be siblings — sharing this icon-over-wordmark stacked composition but each exploring a distinct mark concept or abstract form. Not duplicates. This direction must feel clearly different from a horizontal wordmark layout.",
  },
];

// Four independent SaaS concept directions — one prompt per concept, one image each.
// Used only when isSaasLikeIndustry returns true.
const SAAS_CONCEPT_DIRECTIONS = [
  {
    label: "saas_lead",
    conceptLabel: "Lead concept",
    structureOverride:
      "one polished brand symbol and one wordmark, integrated as a unified horizontal logo — symbol and wordmark feel designed together as one system, not assembled from separate parts",
    layoutOverride:
      "balanced horizontal lockup: symbol left of wordmark, generous professional whitespace, enterprise-grade proportions",
    artNote:
      "Lead logo direction for a tech or software brand. This is the primary commercial brand identity — a polished symbol paired with the wordmark as one integrated horizontal system. The symbol should feel purposefully derived from the brand concept, not generic or decorative. Both elements should read as a unified design with consistent visual weight and spacing. This is the most production-ready, commercially complete direction.",
    toneOverride:
      "primary brand identity, polished integrated symbol and wordmark system, commercial-ready, enterprise-grade quality",
  },
  {
    label: "saas_wordmark",
    conceptLabel: "Custom wordmark",
    structureOverride:
      "a custom-designed wordmark as the sole primary identity element — typography-led design with no separate standalone icon or symbol outside the letterforms",
    layoutOverride:
      "centered or horizontal wordmark-only composition with generous professional whitespace, typography-led lockup",
    artNote:
      "Custom wordmark direction for a tech or software brand. The entire identity is the typography itself — deliberate letterform design with distinctive tracking, purposeful spacing, or subtle modifications that make the wordmark feel crafted rather than typed. No standalone icon or symbol that is separate from the letterforms. If any mark exists, it must be integrated directly into a letter or between letterforms. Do not use plain default bold sans text — this wordmark should have clear typographic personality.",
    toneOverride:
      "custom typography identity, distinctive letterform craft, typographically distinctive wordmark, no generic bold sans",
  },
  {
    label: "saas_app_icon",
    conceptLabel: "App icon system",
    structureOverride:
      "one strong bold standalone symbol mark paired with a clean wordmark below — the symbol must be bold and clear enough to function as an app icon or social avatar on its own",
    layoutOverride:
      "stacked vertical composition: bold standalone symbol mark centered prominently on top, clean wordmark centered below with clear visual separation — mark-over-wordmark hierarchy",
    artNote:
      "App icon system direction for a tech or software brand. The symbol is the hero — it must be bold, clear, and recognizable as a standalone app icon in a square frame or social avatar. The mark should be concept-driven and derived from what the brand does or represents, not just a small decorative version of an initial letter and not a plain rounded-square letter icon. The wordmark appears below as a secondary element. This direction prioritizes icon-scale standalone recognition.",
    toneOverride:
      "app-icon-ready symbol system, bold concept-driven mark, icon-scale recognition, symbol-led identity",
  },
  {
    label: "saas_modular",
    conceptLabel: "Modular mark",
    structureOverride:
      "one modular or geometric system mark paired with a clean wordmark — the mark uses structural, modular, or negative-space logic: interlocking forms, connected geometric pieces, flow paths, or meaningful spatial relationships",
    layoutOverride:
      "stacked vertical or compact horizontal composition featuring the modular mark prominently, clean wordmark below or beside with clear visual separation",
    artNote:
      "Modular mark direction for a tech or software brand. The symbol should be built from a structural or geometric logic — interlocking shapes, modular grid units, connected path pieces, flow structures, or purposeful negative space. The form should suggest structure, connectivity, data flow, or systematic thinking in an abstract and elegant way. Not a badge, not an enclosed emblem or shield shape, not a generic rounded-square letter icon. The geometry should feel intentional, precise, and scalable.",
    toneOverride:
      "modular geometric system mark, structural interlocking forms, negative-space logic, systematic and scalable design",
  },
];

function isSaasLikeIndustry(searchableText, brandStyleRoute) {
  if (brandStyleRoute === "tech_saas") return true;
  if (!searchableText || !searchableText.trim()) return false;

  // Longer terms — substring matching is safe, false positives are unlikely.
  const PHRASE_KEYWORDS = [
    "artificial intelligence", "machine learning",
    "software", "saas", "paas", "iaas",
    "tech", "technology",
    "application",
    "startup",
    "productivity",
    "developer", "devtool", "dev tool",
    "automation",
    "digital product",
    "b2b",
    "platform",
    "data", "analytics", "dashboard",
    "cloud", "infrastructure",
    "api", "integration",
    "cybersecurity", "security software",
    "fintech", "edtech", "healthtech", "proptech",
    "no-code", "low-code",
    "workflow",
  ];

  // Short terms that appear as substrings in unrelated words — require whole-word match.
  // "ai" appears in "email", "paid", "train"; "app" appears in "appetizer", "happy".
  const WORD_KEYWORDS = ["ai", "app"];

  if (PHRASE_KEYWORDS.some((kw) => searchableText.includes(kw))) return true;
  return WORD_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(searchableText));
}

function getConceptDirections(route, industry, input) {
  const brandStyleRoute = String(input?.brandStyleRoute || "").trim();
  const searchableText = [
    input?.industry   || "",
    input?.keywords   || "",
    input?.otherNotes || "",
    input?.notes      || "",
    input?.styleCues  || "",
  ]
    .join(" ")
    .toLowerCase();

  if (route === "tech_saas" && isSaasLikeIndustry(searchableText, brandStyleRoute)) {
    return SAAS_CONCEPT_DIRECTIONS;
  }
  return GROUP_DIRECTIONS;
}

function dbgSlice(v, n) {
  return String(v == null ? "" : v).slice(0, n);
}

function buildIdeogramPrompt(input = {}, groupIndex = 0) {
  const brandName = String(input?.brandName || "Brand").trim();

  const textConstraintTag =
    `The only text in this image is the exact brand name "${brandName}" rendered in clean letterforms. ` +
    `Allowed visual elements: brand name letters and one optional simple abstract mark only. ` +
    `Nothing else should appear in the image — no additional characters, extra letters, small symbols, annotations, badges, labels, seals, dots near the wordmark, or micro details. ` +
    `Do not add subtitles, category labels, descriptor text, industry words, dates, locations, or extra words. ` +
    `Do not write the industry context inside the logo. ` +
    `Preserve the exact letter case of the brand name as typed — do not change it to all-caps, all-lowercase, or title case. ` +
    `Do not include trademark symbols (®), registered mark symbols, trademark superscripts (™), copyright symbols (©), or any superscript characters anywhere in the image.`;

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
    "scalable clean vector identity, clear at small sizes, strong recognition, reproducible in monochrome";
  let typographyTag =
    "custom-designed wordmark typography with distinctive character — not a default system font or generic bold sans, but a wordmark with deliberate letterform personality, unique tracking, or a subtle design detail";

  if (route === "beauty_premium") {
    structureTag = "one refined standalone soft geometric symbol and one clean luxury wordmark";
    layoutTag = "elegant balanced centered composition or premium lockup";
    toneTag = "premium beauty identity, refined minimal luxury logo, soft geometric elegance";
    disciplineTag =
      "scalable premium identity, clear premium spacing, clean at small sizes, distinctive but restrained, packaging-scale legible";
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
      "clean production-ready vector, small-size clarity, monochrome friendly, scalable compact mark";
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

  // Apply group art direction — overrides route defaults so the two request groups
  // produce clearly different composition, mark concept, and layout.
  const conceptDirections = getConceptDirections(route, industry, input);
  const group = conceptDirections[groupIndex] ?? conceptDirections[0];

  if (!logoStructure) {
    structureTag = group.structureOverride;
    layoutTag = group.layoutOverride;
  }
  const variationNote = group.artNote;
  if (group.toneOverride) {
    toneTag = group.toneOverride;
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

  const COOL_TECH_BLUE =
    "Two-color logo. The symbol or one key letterform must use a bright saturated modern tech blue (vivid electric blue, not dark navy, not steel, not indigo). The wordmark uses dark charcoal or dark navy. Do not create a fully black, fully charcoal, or monochrome-only logo. Tech blue must be clearly visible as a distinct color in the final image.";

  /** @type {Record<string, string>} */
  const CD_MAP = {
    black_white_first: "Color palette: monochrome-first, black and white friendly.",
    cool_tech: COOL_TECH_BLUE,
    tech_blue: COOL_TECH_BLUE,
    blue: COOL_TECH_BLUE,
    "cool blue": COOL_TECH_BLUE,
    "Cool Tech Blue": COOL_TECH_BLUE,
    warm_neutral: "Color palette: warm neutral balance.",
    soft_premium: "Color palette: soft premium restraint.",
    bold_contrast: "Color palette: bold clean contrast.",
    earthy_natural: "Color palette: earthy natural warmth.",
  };

  let colorTag = "";
  if (colorTheme) {
    colorTag = CD_MAP[colorTheme] || `Color palette: ${colorTheme}.`;
  } else if (colorDirection === "custom") {
    colorTag = "Color direction: custom brand-appropriate palette.";
  } else {
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

  if (colorTag && colorTag !== CD_MAP["black_white_first"]) {
    disciplineTag = disciplineTag
      .replace("reproducible in monochrome", "scalable and production-ready")
      .replace("monochrome friendly", "scalable");
  }

  if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
    console.log("[prompt-debug] groupIndex=%d brand=%j route=%s industry=%j brandStyleRoute=%j",
      groupIndex, brandName, route, dbgSlice(industryRaw, 80), dbgSlice(brandStyleRoute, 40));
    console.log("[prompt-debug] colorDirection=%j colorTheme=%j colorTag=%j",
      colorDirection, dbgSlice(colorTheme, 60), dbgSlice(colorTag, 150));
    const saasDirections = Boolean(group.toneOverride);
    console.log("[prompt-debug] conceptLabel=%j saasDirections=%s toneOverride=%j",
      group.label || "none", saasDirections, dbgSlice(group.toneOverride, 80));
  }

  const industryBaseTag =
    industryRaw && !industryRaw.match(/^[,.\s]+$/)
      ? `Industry context: ${industryRaw}.`
      : "";

  const styleCuesText = styleCues || keywords;
  const styleCuesTag = styleCuesText ? `Style cues: ${styleCuesText}.` : "";
  const notesTag = otherNotes ? `Art direction notes: ${otherNotes}.` : "";
  const exclusionTag =
    "Plain white background only. Standalone logo mark on white. " +
    "No photo scene, no lifestyle imagery, no mockup, no product shot, no table, no cup, " +
    "no environment, no background texture, no gradient backdrop, no people, no hands, no mascots.";

  const backgroundTag = "Centered composition on plain white background. Vector-style flat graphic design.";

  const prompt = [
    `Flat vector logo design for "${brandName}".`,
    colorTag,
    variationNote,
    industryBaseTag,
    `${structureTag}.`,
    `${layoutTag}.`,
    `${toneTag}.`,
    `${disciplineTag}.`,
    `Typography: ${typographyTag}.`,
    moodTag,
    styleCuesTag,
    notesTag,
    textConstraintTag,
    backgroundTag,
    exclusionTag,
  ]
    .filter(Boolean)
    .join(" ");

  if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
    console.log("[prompt-debug] promptPreview=%j", dbgSlice(prompt, 1200));
  }

  return { prompt, style_name: route, conceptLabel: group.conceptLabel ?? null };
}

async function generateIdeogramLogos(input = {}) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing IDEOGRAM_API_KEY in env");
  }

  // SaaS: 4 independent concept prompts × 1 image each (Lead, Custom wordmark, App icon, Modular mark).
  // Non-SaaS: 2 group prompts × 2 sibling images each (unchanged GROUP_DIRECTIONS behavior).
  const saasSearchableText = [
    input?.industry   || "",
    input?.keywords   || "",
    input?.otherNotes || "",
    input?.notes      || "",
    input?.styleCues  || "",
  ].join(" ").toLowerCase();
  const saasRoute = String(input?.brandStyleRoute || "").trim();
  const isSaas = isSaasLikeIndustry(saasSearchableText, saasRoute);
  const conceptCount = isSaas ? 4 : 2;
  const numImages = isSaas ? 1 : 2;

  const groups = await Promise.all(
    Array.from({ length: conceptCount }, (_, i) => i).map(async (conceptIndex) => {
      const { prompt, style_name, conceptLabel } = buildIdeogramPrompt(input, conceptIndex);

      if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
        console.log("[ideogram-request] conceptIndex=%d num_images=%d magic_prompt=OFF style_type=DESIGN aspect_ratio=1x1 rendering_speed=QUALITY promptPreview=%j",
          conceptIndex, numImages, dbgSlice(prompt, 300));
      }

      const response = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          num_images: numImages,
          // Disable Ideogram magic prompt enhancement — prevents scene context being added to logo prompts.
          magic_prompt: "OFF",
          // Confirmed Ideogram v3 quality parameters.
          style_type: "DESIGN",
          aspect_ratio: "1x1",
          rendering_speed: "QUALITY",
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
        .filter((u) => typeof u === "string" && u.trim())
        .slice(0, numImages);

      if (imageUrls.length < 1) {
        throw new Error(`Ideogram returned ${imageUrls.length} images for concept ${conceptIndex}, expected ${numImages}`);
      }

      return imageUrls.map((imageUrl) => ({
        imageUrl,
        prompt,
        style_name,
        conceptLabel: conceptLabel ?? null,
        model: "ideogram",
        mode: "text-to-image",
      }));
    })
  );

  return groups.flat();
}

module.exports = {
  generateIdeogramLogos,
};
