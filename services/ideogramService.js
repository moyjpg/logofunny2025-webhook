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
    magicPrompt: "AUTO",
    structureOverride:
      "concept-driven symbol left, clean wordmark right, integrated as one horizontal logo system",
    layoutOverride:
      "balanced horizontal lockup, symbol and wordmark as one unified composition, generous professional whitespace",
    artNote:
      "Polished horizontal brand identity: a concept-driven symbol on the left, clean wordmark on the right, both feeling designed together as one complete system. The symbol has real visual presence — derived from the brand idea, with weight and finish. Proportions and spacing feel intentional and premium.",
    toneOverride:
      "polished commercial-grade tech brand identity, complete and intentional",
  },
  {
    label: "saas_wordmark",
    conceptLabel: "Custom wordmark",
    magicPrompt: "OFF",
    structureOverride:
      "custom wordmark as the complete identity — typography-led, no separate symbol",
    layoutOverride:
      "centered or horizontal wordmark, generous whitespace, typography-led composition",
    artNote:
      "Typography-first identity — the wordmark is the complete logo. Any visual detail should be integrated into the letterforms, not placed as a separate standalone icon. Distinctive letterform design: deliberate tracking, purposeful spacing, or a subtle letter modification that makes the name feel crafted and drawn, not typed in a default font.",
    toneOverride:
      "distinctive letterform craft, typographically distinctive wordmark, custom type identity",
  },
  {
    label: "saas_app_icon",
    conceptLabel: "App icon system",
    magicPrompt: "AUTO",
    structureOverride:
      "large bold concept-driven symbol mark above, clean wordmark below — stacked vertical system",
    layoutOverride:
      "stacked vertical composition: bold symbol centered on top with strong visual weight, wordmark centered below with clear spacing",
    artNote:
      "Bold symbol-first identity: a strong, concept-driven icon mark that stands alone as an app icon or social avatar — full visual weight, complete and finished. The symbol is derived from what the brand does, not just a letter shape. Wordmark sits cleanly below as a secondary element.",
    toneOverride:
      "bold concept-driven symbol system, app-icon-ready mark, complete and recognizable",
  },
  {
    label: "saas_modular",
    conceptLabel: "Modular mark",
    magicPrompt: "OFF",
    structureOverride:
      "modular geometric system mark with wordmark — mark uses interlocking forms, grid logic, or meaningful negative space",
    layoutOverride:
      "stacked or compact horizontal: modular mark prominent, clean wordmark below or beside",
    artNote:
      "Geometric system mark built from structural logic: interlocking shapes, modular grid units, connected path pieces, or purposeful negative space that suggests connectivity, data flow, or systematic thinking. The mark feels engineered — precise, architecturally satisfying, and complete as a standalone graphic. Paired with a clean wordmark. Not an enclosed badge or shield.",
    toneOverride:
      "modular geometric system mark, structural and precise, engineered aesthetic",
  },
];

// Output rules appended to every prompt that arrives via the conceptPrompts path.
const CONCEPT_PROMPTS_SUFFIX =
  "One centered logo only on a plain clean background. " +
  "Keep the space around the wordmark clean and intentional. " +
  "No random stray marks, floating dots, or trademark-style symbols near the brand name. " +
  "Do not create brand boards, color tiles, color swatches, mockups, presentation sheets, " +
  "multiple logo versions, split background panels, comparison layouts, " +
  "or any image showing more than one logo composition. " +
  "The output should look like a polished, finished logo a designer would present to a client — complete hierarchy, intentional spacing, and ready for immediate brand use.";

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

function detectPetAnimal(text) {
  const COMBO_PHRASES = ["dog and cat", "dogs and cats"];
  if (COMBO_PHRASES.some((p) => text.includes(p))) return "dog_and_cat";
  const hasDog = ["dog", "dogs", "puppy", "puppies", "canine"].some((s) => text.includes(s));
  const hasCat = ["cat", "cats", "kitten", "kittens", "feline"].some((s) => text.includes(s));
  if (hasDog && hasCat) return "dog_and_cat";
  if (hasDog) return "dog";
  if (hasCat) return "cat";
  return "none";
}

function getPetAnimalCue(animalTarget) {
  if (animalTarget === "dog") {
    return (
      "Use a friendly dog-inspired cue — dog face silhouette, ear, paw, or tail shape — " +
      "as a clean flat geometric brand mark. Keep this dog-inspired mark consistent across all concepts."
    );
  }
  if (animalTarget === "cat") {
    return (
      "Use a friendly cat-inspired cue — cat face silhouette, ear, whisker arc, or tail curve — " +
      "as a clean flat geometric brand mark. Keep this cat-inspired mark consistent across all concepts."
    );
  }
  if (animalTarget === "dog_and_cat") {
    return (
      "Use a shared pet-family cue — a paw print, simple paired pet face, or dog-and-cat-friendly silhouette — " +
      "as a clean flat geometric brand mark. Keep this pet-family shape consistent across all concepts."
    );
  }
  return (
    "Use a simple geometric pet cue — paw print or simple pet face silhouette — " +
    "as a clean flat geometric brand mark."
  );
}

// --- 5-point creative brief helpers ---

function buildFeelingFromKeywords(keywords, industry) {
  const kw = (keywords || "").toLowerCase();
  const matches = [];
  const SIGNALS = [
    [["warm", "cozy", "inviting"],                   "warm and inviting"],
    [["playful", "fun", "bouncy"],                   "playful and energetic"],
    [["friendly", "approachable", "welcoming"],      "friendly and approachable"],
    [["premium", "luxury", "luxurious", "high-end"], "premium and refined"],
    [["elegant", "graceful", "sophisticated"],       "elegant and sophisticated"],
    [["minimal", "simple", "clean"],                 "minimal and refined"],
    [["bold", "strong", "impact", "powerful"],       "bold and confident"],
    [["modern", "contemporary", "fresh"],            "modern and fresh"],
    [["professional", "corporate", "business"],      "professional and trustworthy"],
    [["creative", "expressive", "artistic"],         "creative and expressive"],
    [["natural", "organic", "earthy"],               "natural and grounded"],
    [["charming", "cute", "sweet"],                  "charming and approachable"],
    [["trustworthy", "reliable", "secure"],          "trustworthy and dependable"],
    [["intelligent", "smart", "clever"],             "intelligent and purposeful"],
    [["energetic", "dynamic", "active"],             "energetic and dynamic"],
    [["calm", "serene", "gentle", "peaceful"],       "calm and balanced"],
    [["soft", "delicate", "light"],                  "soft and gentle"],
    [["cheerful", "joyful", "happy"],                "cheerful and joyful"],
  ];
  for (const [signals, feeling] of SIGNALS) {
    if (signals.some((s) => kw.includes(s))) matches.push(feeling);
  }
  if (matches.length > 0) return matches.slice(0, 3).join(", ");

  // Industry defaults when no keyword signals are found
  if (industry.includes("pet"))                                              return "warm, friendly, and emotionally approachable";
  if (industry.includes("beauty") || industry.includes("skincare"))         return "premium, soft, and elegant";
  if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) return "modern, confident, and trustworthy";
  if (industry.includes("food") || industry.includes("beverage"))           return "warm, inviting, and appetizing";
  if (industry.includes("cafe") || industry.includes("restaurant"))         return "warm, friendly, and welcoming";
  if (industry.includes("home") || industry.includes("decor"))              return "warm, refined, and welcoming";
  if (industry.includes("creative") || industry.includes("studio"))         return "creative, expressive, and confident";
  if (industry.includes("health") || industry.includes("wellness"))         return "calm, trustworthy, and balanced";
  if (industry.includes("fashion") || industry.includes("apparel"))         return "refined, editorial, and confident";
  if (industry.includes("fitness") || industry.includes("sport"))           return "energetic, bold, and motivating";
  if (industry.includes("finance") || industry.includes("fintech"))         return "trustworthy, secure, and professional";
  if (industry.includes("legal") || industry.includes("consulting"))        return "authoritative, trustworthy, and refined";
  if (industry.includes("education"))                                        return "trustworthy, approachable, and encouraging";
  return "professional, distinctive, and memorable";
}

function buildVisualMetaphors(industry, animalTarget, keywords, notes) {
  if (industry.includes("pet")) {
    if (animalTarget === "dog")         return "a friendly dog companion idea fused with a collar tag, wagging-tail curve, or soft paw rhythm — warm, loyal, and memorable as one simple mark";
    if (animalTarget === "cat")         return "a graceful cat silhouette combined with a whisker arc or tail curve — feline elegance and quiet warmth fused into one refined mark";
    if (animalTarget === "dog_and_cat") return "a shared paw or paired pet silhouette that carries both dog and cat warmth — one welcoming mark for both animal companions";
    return "a friendly pet face or paw rhythm combined with a warm rounded form — approachable and memorable as one simple mark";
  }
  if (industry.includes("home") || industry.includes("decor"))                  return "a botanical form nested inside a sheltering arch — leaf, bloom, and home warmth combined into one refined mark";
  if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) return "a clean spark, node, cursor, or flow shape fused into one simple clarity symbol — purposeful and modern";
  if (industry.includes("beauty") || industry.includes("skincare"))             return "a soft petal or bloom form growing from a clean drop or arc — botanical refinement and skincare ritual fused into one elegant mark";
  if (industry.includes("food") || industry.includes("beverage"))               return "a simple leaf, grain, or ingredient shape paired with warmth — artisan craft and nourishing energy combined into one appetizing mark";
  if (industry.includes("cafe") || industry.includes("restaurant"))             return "a steam arc rising from a cup or bean form — warmth, craft, and hospitality fused into one inviting mark";
  if (industry.includes("health") || industry.includes("wellness"))             return "a gentle leaf arc or organic growth form balanced with calm open space — natural flow and quiet strength combined into one serene mark";
  if (industry.includes("fitness") || industry.includes("sport"))               return "a bold motion arc or speed line combined with a strong geometric silhouette — energy and strength fused into one kinetic mark";
  if (industry.includes("fashion") || industry.includes("apparel"))             return "a refined editorial line or minimal geometric tension — quiet luxury and typographic strength fused into one precise mark";
  if (industry.includes("creative") || industry.includes("studio"))             return "a bold geometric form combined with a signature visual concept — creative tension and editorial clarity fused into one distinctive mark";
  if (industry.includes("finance") || industry.includes("fintech"))             return "a stable geometric base combined with an upward arc or growth line — structure and forward momentum fused into one trustworthy mark";
  if (industry.includes("legal") || industry.includes("consulting"))            return "a measured balanced form combined with clean authority lines — precision and credibility fused into one stable mark";
  if (industry.includes("education"))                                            return "an open path or arc combined with a spark of learning — forward movement and clear structure fused into one encouraging mark";
  if (industry.includes("real_estate") || industry.includes("real estate"))     return "a refined arch or elevated geometric form combined with premium space — architectural clarity and quiet aspiration fused into one distinguished mark";
  const allText = (keywords + " " + notes).toLowerCase();
  if (allText.includes("nature") || allText.includes("plant") || allText.includes("organic") || allText.includes("botanical")) {
    return "a botanical leaf or organic growth form combined with clean geometric balance — natural and purposeful fused into one memorable mark";
  }
  return "a clean abstract form with a strong geometric concept — two compatible shapes fused into one simple, memorable brand mark";
}

function buildShapeDirection(industry, keywords) {
  const kw = (keywords || "").toLowerCase();
  if (kw.includes("rounded") || (kw.includes("soft") && !kw.includes("software"))) return "rounded organic curves, soft approachable forms, warm and balanced";
  if (kw.includes("geometric") || kw.includes("modular") || kw.includes("grid"))    return "geometric precision, clean modular structure, strong angular or grid-based forms";
  if (kw.includes("minimal") || kw.includes("simple"))                              return "minimal and airy, generous negative space, refined and restrained";
  if (kw.includes("bold") || kw.includes("strong") || kw.includes("impact"))        return "bold high-contrast forms, strong geometric silhouette, confident visual weight";
  if (kw.includes("elegant") || kw.includes("premium") || kw.includes("luxury"))   return "refined elegant proportions, precise deliberate spacing, restrained and polished";
  if (kw.includes("playful") || kw.includes("fun") || kw.includes("bouncy"))        return "playful rounded forms, bouncy rhythm, energetic but clean silhouette";
  if (industry.includes("pet"))                                                      return "rounded, organic, and friendly — warm curves and soft approachable shapes";
  if (industry.includes("home") || industry.includes("decor"))                      return "soft organic curves, botanical rhythm, warm structured balance";
  if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) return "geometric, clean, and precise — strong scalable silhouette with intentional negative space";
  if (industry.includes("beauty") || industry.includes("skincare"))                 return "refined soft geometry, elegant and restrained with premium proportions";
  if (industry.includes("food") || industry.includes("cafe") || industry.includes("restaurant")) return "warm and rounded, inviting organic forms with natural rhythm";
  if (industry.includes("fitness") || industry.includes("sport"))                   return "bold angular forms, high-contrast silhouette, strong kinetic energy";
  if (industry.includes("fashion") || industry.includes("apparel"))                 return "editorial proportions, deliberate minimal structure, refined tension";
  if (industry.includes("finance") || industry.includes("legal") || industry.includes("consulting")) return "stable geometric structure, authoritative clear proportions, balanced and grounded";
  if (industry.includes("health") || industry.includes("wellness"))                 return "gentle organic curves, balanced and airy, calm structured form";
  return "balanced and purposeful — clean structure with a strong one-color silhouette";
}

function buildTypographyDirection(typographyDir, industry, keywords) {
  const TYPO_MAP = {
    clean_sans:             "clean modern sans-serif with strong readability and deliberate spacing",
    geometric_sans:         "geometric sans-serif, crisp and modern, strong character proportions",
    bold_modern:            "bold modern sans with confident weight and clear commercial readability",
    elegant_serif:          "elegant refined serif with premium rhythm and graceful spacing",
    editorial_sans:         "editorial clean sans with strong typographic hierarchy",
    luxury_minimal:         "luxury minimal letterforms with refined calm spacing and premium restraint",
    rounded_friendly:       "soft rounded letterforms with friendly warmth and clear readability",
    handcrafted_expressive: "expressive custom lettering with handcrafted character and natural rhythm",
  };
  if (typographyDir && TYPO_MAP[typographyDir]) return TYPO_MAP[typographyDir];

  const kw = (keywords || "").toLowerCase();
  if (kw.includes("rounded") || kw.includes("friendly") || kw.includes("playful") || (kw.includes("soft") && !kw.includes("software"))) return "soft rounded letterforms with warm approachable character and clear readability";
  if (kw.includes("bold") || kw.includes("strong") || kw.includes("impact"))                 return "bold confident letterforms with strong commercial weight and clear readability";
  if (kw.includes("elegant") || kw.includes("premium") || kw.includes("luxury"))             return "refined elegant letterforms with graceful premium spacing";
  if (kw.includes("minimal") || kw.includes("clean"))                                         return "clean minimal sans with deliberate spacing and strong readability";
  if (kw.includes("editorial") || kw.includes("creative") || kw.includes("artistic"))        return "editorial clean letterforms with strong typographic personality";
  if (industry.includes("pet"))                                                                return "soft rounded letterforms with friendly warmth and clear readable character";
  if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) return "clean geometric sans with strong readability and confident modern spacing";
  if (industry.includes("beauty") || industry.includes("skincare"))                           return "refined elegant letterforms with graceful premium spacing";
  if (industry.includes("home") || industry.includes("decor"))                                return "warm refined letterforms with organic rhythm and clear readability";
  if (industry.includes("food") || industry.includes("cafe") || industry.includes("restaurant")) return "warm approachable letterforms with friendly character";
  if (industry.includes("fashion") || industry.includes("apparel"))                           return "editorial clean letterforms with precise spacing and strong typographic presence";
  if (industry.includes("fitness") || industry.includes("sport"))                             return "bold confident letterforms with strong silhouette and energetic weight";
  if (industry.includes("finance") || industry.includes("legal") || industry.includes("consulting")) return "clean professional letterforms with authoritative clarity and strong readability";
  if (industry.includes("creative") || industry.includes("studio"))                           return "editorial letterforms with distinctive personality and clean commercial finish";
  return "custom lettering with strong readability, deliberate character, and commercial polish";
}

function buildAvoidDrift(industry, animalTarget, keywords) {
  const rules = [];
  if (industry.includes("pet")) {
    if (animalTarget === "dog")         rules.push("stay in the dog creative world — unrelated animals like cats, foxes, or bears would pull the brand off course");
    else if (animalTarget === "cat")    rules.push("stay in the cat creative world — avoid drifting into dogs or other unrelated animals");
    else if (animalTarget === "dog_and_cat") rules.push("stay within dog and cat territory — other unrelated animals would break the brand world");
    else                                rules.push("keep the visual world warm and pet-friendly — avoid unrelated animals");
    rules.push("avoid detailed mascot scenes, cartoon fur textures, clipart animals, and childish illustration styles");
  } else if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) {
    rules.push("avoid robots, circuit boards, hexagon clichés, generic AI sparkle clusters, dashboard mockups, and literal computer hardware illustrations");
  } else if (industry.includes("home") || industry.includes("decor")) {
    rules.push("avoid house clipart, real estate for-sale signs, furniture room illustrations, floor plan diagrams, and overly rustic barn aesthetics");
  } else if (industry.includes("beauty") || industry.includes("skincare")) {
    rules.push("avoid product bottle illustrations, portrait faces, glitter, spa lifestyle scenes, and fine details that disappear at small sizes");
  } else if (industry.includes("food") || industry.includes("cafe") || industry.includes("restaurant")) {
    rules.push("avoid food photo realism, menu-style layouts, complex vintage badge overload, and detailed food scene illustrations");
  } else if (industry.includes("fitness") || industry.includes("sport")) {
    rules.push("avoid detailed athlete figure illustrations, gym equipment scene art, aggressive mascot energy, and cluttered trophy-style badge layouts");
  } else if (industry.includes("finance") || industry.includes("fintech")) {
    rules.push("avoid dollar signs, coin illustrations, candlestick charts, bank building drawings, and generic corporate swoosh arcs");
  } else if (industry.includes("legal") || industry.includes("consulting")) {
    rules.push("avoid scale-of-justice clipart, gavel drawings, courthouse illustrations, and generic authority clichés");
  } else if (industry.includes("health") || industry.includes("wellness")) {
    rules.push("avoid medical cross overuse, anatomy diagrams, clinical product illustrations, and lotus or mandala clichés");
  } else {
    rules.push("avoid generic clipart, unrelated scene illustrations, and visual styles that conflict with the brand's established feeling");
  }
  rules.push("no random floating marks, stray dots, or trademark-style symbols near the brand name");
  return rules.join("; ");
}

function shouldAllowDescriptor(input) {
  const ind = String(input?.industry || "").toLowerCase();
  return (
    ind.includes("home")     || ind.includes("decor")     ||
    ind.includes("cafe")     || ind.includes("coffee")    ||
    ind.includes("bakery")   || ind.includes("restaurant") ||
    ind.includes("wedding")  || ind.includes("studio")    ||
    ind.includes("wellness") || ind.includes("handmade")  ||
    ind.includes("boutique") || ind.includes("pet")
  );
}

function getCategoryDescriptor(input) {
  const ind = String(input?.industry || "").toLowerCase();
  if (ind.includes("home") || ind.includes("decor"))     return "HOME + DECOR";
  if (ind.includes("cafe") || ind.includes("coffee"))    return "CAFE";
  if (ind.includes("bakery"))                            return "BAKERY";
  if (ind.includes("restaurant"))                        return "RESTAURANT";
  if (ind.includes("wedding"))                           return "WEDDINGS";
  if (ind.includes("studio"))                            return "STUDIO";
  if (ind.includes("wellness"))                          return "WELLNESS";
  if (ind.includes("handmade"))                          return "HANDMADE";
  if (ind.includes("boutique"))                          return "BOUTIQUE";
  if (ind.includes("pet"))                               return "PETS";
  return null;
}

/**
 * Builds a 5-point creative brief for one concept direction.
 * Translates user input into commercial design-direction language without rigid prohibition lists.
 */
function buildConceptBriefPrompt(input, conceptKey) {
  const industryRaw = String(input?.industry || "").toLowerCase();
  const keywords = [
    String(input?.keywords  || ""),
    String(input?.styleCues || ""),
  ].filter(Boolean).join(" ").trim();
  const notes        = String(input?.otherNotes || input?.notes || "").trim();
  const typographyDir = String(input?.typographyDirection || "").trim();
  const brandName    = String(input?.brandName || "").trim();

  const petSearchText = [brandName, String(input?.industry || ""), keywords, notes].join(" ").toLowerCase();
  const animalTarget  = industryRaw.includes("pet") ? detectPetAnimal(petSearchText) : "none";

  const feeling    = buildFeelingFromKeywords(keywords, industryRaw);
  const metaphors  = buildVisualMetaphors(industryRaw, animalTarget, keywords, notes);
  const shapes     = buildShapeDirection(industryRaw, keywords);
  const typography = buildTypographyDirection(typographyDir, industryRaw, keywords);
  const avoid      = buildAvoidDrift(industryRaw, animalTarget, keywords);

  const brief =
    `Brand feeling: ${feeling}. ` +
    `Visual direction: ${metaphors}. ` +
    `Shape language: ${shapes}. ` +
    `Typography: ${typography}. ` +
    `Creative boundary: ${avoid}.`;

  switch (conceptKey) {
    case "recommended": {
      const descriptor = shouldAllowDescriptor(input) ? getCategoryDescriptor(input) : null;
      const descriptorLine = descriptor
        ? `A short category descriptor like "${descriptor}" may appear in small caps below the wordmark, subordinate to the brand name — only if it reads as a clean professional brand label, never as random text.`
        : "";
      return [
        "Concept direction: Lead commercial logo — polished, complete, and commercially ready. " +
        "Balanced symbol icon paired with a readable wordmark, or a strong standalone wordmark if the brand calls for it.",
        brief,
        "Create a polished commercial brand lockup with mature spacing, clear hierarchy, refined typography, and an intentional mark-to-wordmark relationship. " +
        "It should feel ready for packaging, website header, social profile, and brand identity use.",
        descriptorLine,
      ].filter(Boolean).join(" ");
    }
    case "wordmark":
      return [
        "Concept direction: Lettering-led wordmark — the brand name is the entire logo. " +
        "Custom lettering carries the brand's personality. " +
        "Readability comes first — letterforms must be clearly readable at first glance. " +
        "Subtle integrated brand cues are welcome: a visual idea discovered in the letterforms through negative space, a stroke extension, a modified counter, or one intentional visual cue inside a single letter. " +
        "The integration should feel designed into the letters, not applied on top of them. " +
        "No separate icon or graphic element outside the letterforms. " +
        "Plain clean background.",
        brief,
        "The wordmark should feel like mature custom typography, not plain typed text. " +
        "Integrated negative-space or letterform cues are welcome only when they improve personality and keep the name readable.",
      ].join(" ");
    case "app_icon":
      return [
        "Concept direction: App icon and social avatar — one compact, bold idea. " +
        "Designed for favicon, app icon, and social avatar sizes. " +
        "May use a simplified animal face, paw, abstract brand symbol, or one large initial. " +
        "The icon stands alone — no full horizontal wordmark. " +
        "Centered, simple, and instantly recognizable at small sizes.",
        brief,
        "Favor one compact graphic idea that works at small sizes: an icon, mascot head, avatar-like symbol, or single initial. " +
        "Avoid full horizontal wordmark layouts.",
      ].join(" ");
    case "symbol_mark": {
      const descriptor = shouldAllowDescriptor(input) ? getCategoryDescriptor(input) : null;
      const descriptorLine = descriptor
        ? `A short category descriptor like "${descriptor}" may appear in small caps below the wordmark, subordinate to the brand name — only if it reads as a clean professional brand label, never as random text.`
        : "";
      return [
        "Concept direction: Symbol exploration — a memorable standalone mark paired with the brand name. " +
        "The symbol has a strong independent silhouette and is concept-driven, not generic. " +
        "Derived from the brand's visual direction and metaphors. " +
        "Works as a standalone mark and as a full lockup with the wordmark below or beside it.",
        brief,
        "The symbol should be the hero: a memorable mark with a strong silhouette and a clear relationship to the brand idea. " +
        "It should feel designed, not like literal clipart.",
        descriptorLine,
      ].filter(Boolean).join(" ");
    }
    default:
      return brief;
  }
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
  const CONCEPT_PROMPT_KEYS = ["recommended", "wordmark", "app_icon", "symbol_mark"];
  const conceptKey = CONCEPT_PROMPT_KEYS[groupIndex];
  if (
    conceptKey &&
    input?.conceptPrompts != null &&
    typeof input.conceptPrompts === "object" &&
    typeof input.conceptPrompts[conceptKey] === "string" &&
    input.conceptPrompts[conceptKey].trim()
  ) {
    const parts = [
      input.conceptPrompts[conceptKey].trim(),
      buildConceptBriefPrompt(input, conceptKey),
      CONCEPT_PROMPTS_SUFFIX,
    ];

    return {
      prompt: parts.join(" "),
      style_name: "logofunny",
      conceptLabel: conceptKey,
      magicPromptOverride: "OFF",
    };
  }

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

  const petSearchText = [
    brandName,
    industryRaw,
    keywords,
    styleCues,
    String(input?.promptOverride || ""),
    colorDirection,
    typographyDirection,
  ].join(" ").toLowerCase();
  const INDUSTRY_CONTEXT_OVERRIDES = {
    pet_brand:
      "Industry context: pet brand. " +
      getPetAnimalCue(detectPetAnimal(petSearchText)) +
      " No cartoon mascot, no clipart illustration, no childish character art.",
  };
  const industryBaseTag =
    industryRaw && !industryRaw.match(/^[,.\s]+$/)
      ? (INDUSTRY_CONTEXT_OVERRIDES[industryRaw] || `Industry context: ${industryRaw}.`)
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

  return { prompt, style_name: route, conceptLabel: group.conceptLabel ?? null, magicPromptOverride: group.magicPrompt ?? null };
}

async function generateIdeogramLogos(input = {}) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing IDEOGRAM_API_KEY in env");
  }

  const VALID_MAGIC_PROMPT = new Set(["OFF", "ON", "AUTO"]);
  const magicPromptRaw    = String(process.env.LOGOFUNNY_IDEOGRAM_MAGIC_PROMPT || "").toUpperCase();
  const globalMagicPrompt = VALID_MAGIC_PROMPT.has(magicPromptRaw) ? magicPromptRaw : "OFF";

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
  const hasConceptPrompts =
    input?.conceptPrompts != null &&
    typeof input.conceptPrompts === "object" &&
    !Array.isArray(input.conceptPrompts);
  const isSaas = hasConceptPrompts || isSaasLikeIndustry(saasSearchableText, saasRoute);
  const conceptCount = isSaas ? 4 : 2;
  const numImages    = isSaas ? 1 : 2;

  const groups = await Promise.all(
    Array.from({ length: conceptCount }, (_, i) => i).map(async (conceptIndex) => {
      const { prompt, style_name, conceptLabel, magicPromptOverride } = buildIdeogramPrompt(input, conceptIndex);
      const resolvedMagicPrompt = VALID_MAGIC_PROMPT.has(magicPromptOverride ?? "")
        ? magicPromptOverride
        : globalMagicPrompt;

      if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
        console.log("[ideogram-request] conceptIndex=%d num_images=%d magic_prompt=%s style_type=DESIGN aspect_ratio=1x1 rendering_speed=QUALITY promptPreview=%j",
          conceptIndex, numImages, resolvedMagicPrompt, dbgSlice(prompt, 300));
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
          magic_prompt: resolvedMagicPrompt,
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
