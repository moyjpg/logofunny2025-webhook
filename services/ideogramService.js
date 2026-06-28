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
  "One centered logo only on a pure white background. No card, no paper texture, no beige, no colored wash. " +
  "No stray marks, trademark symbols, or random meaningless text near the brand name. " +
  "No brand boards, mockups, or multiple versions in one image.";

// Minimal guardrails appended after every structured concept prompt.
const MINIMAL_CONCEPT_SUFFIX =
  "Create one clean standalone commercial logo on a pure white background. " +
  "Canvas background must be pure bright white (#FFFFFF), not off-white, cream, beige, paper, or warm-tinted. Color belongs only inside the logo elements. " +
  "Use one centered composition only. " +
  "Make the brand name readable and accurate. " +
  "Use clear spacing and a memorable silhouette. " +
  "The result should look like a finished logo for a real brand. " +
  "Do not add any extra text, legal marks, or trademark symbols. " +
  "Do not create a divided or multi-panel layout.";

const ANIMAL_TRAITS = {
  dog:    "floppy rounded ears drooping from the sides, a rounded friendly muzzle with a small circular nose, warm forward-facing dog face",
  cat:    "upright pointed ears, a compact round cat face, implied whisker arc, elegant feline silhouette or tail curve",
  bird:   "curved beak, rounded compact head, wing arc or spread feather shape, alert bird form",
  rabbit: "long upright ears, a round compact bunny face, small dot nose, soft rounded body",
  fox:    "pointed upright ears, a narrow tapered muzzle, bushy tail arc, alert fox face",
  bear:   "small rounded ears, a broad round bear head, wide friendly muzzle, sturdy rounded silhouette",
  panda:  "distinct round eye patches, compact round head, high-contrast dark and light circular markings",
  fish:   "streamlined body arc, fin shapes, tail fan spread, fluid flowing form",
  horse:  "elegant elongated head, flowing mane arc, strong graceful neck, equine silhouette",
  owl:    "large round eyes, a rounded compact owl head, subtle wing arc or feather texture",
};

const LOGO_ANIMAL_KEYWORDS = [
  { key: "dog",    words: ["dog", "dogs", "puppy", "puppies", "canine", "pup"] },
  { key: "cat",    words: ["cat", "cats", "kitten", "kittens", "feline"] },
  { key: "bird",   words: ["bird", "birds", "parrot", "parakeet", "budgie", "cockatiel", "macaw"] },
  { key: "rabbit", words: ["rabbit", "rabbits", "bunny", "bunnies", "hare"] },
  { key: "fox",    words: ["fox", "foxes"] },
  { key: "bear",   words: ["bear", "bears", "grizzly", "teddy"] },
  { key: "panda",  words: ["panda", "pandas"] },
  { key: "fish",   words: ["fish", "goldfish", "betta"] },
  { key: "horse",  words: ["horse", "horses", "pony", "equine", "stallion", "mare"] },
  { key: "owl",    words: ["owl", "owls"] },
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

function detectLogoAnimal(text) {
  for (const { key, words } of LOGO_ANIMAL_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return key;
  }
  return null;
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
    if (animalTarget === "dog")         return "combine loyal dog companion, collar tag, wagging-tail curve, and soft paw rhythm into one warm memorable mark";
    if (animalTarget === "cat")         return "combine graceful cat silhouette, whisker arc, and tail curve into one refined feline mark";
    if (animalTarget === "dog_and_cat") return "combine dog and cat shapes, a shared paw, or a paired pet silhouette into one welcoming mark";
    return "combine a friendly pet face, paw rhythm, and warm rounded form into one approachable mark";
  }
  if (industry.includes("home") || industry.includes("decor"))                  return "combine leaf, bloom, nest, and cozy home shelter into one refined botanical mark";
  if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) return "combine spark, node, cursor, flow, and clarity into one clean modern symbol";
  if (industry.includes("beauty") || industry.includes("skincare"))             return "combine soft petal, bloom, and gentle drop into one elegant botanical mark";
  if (industry.includes("food") || industry.includes("beverage"))               return "combine leaf, grain, artisan ingredient, and warmth into one appetizing mark";
  if (industry.includes("cafe") || industry.includes("restaurant"))             return "combine steam arc, cup, bean, and hospitality warmth into one inviting mark";
  if (industry.includes("health") || industry.includes("wellness"))             return "combine leaf arc, organic flow, and calm open space into one serene balanced mark";
  if (industry.includes("fitness") || industry.includes("sport"))               return "combine bold motion arc, speed line, and geometric strength into one kinetic mark";
  if (industry.includes("fashion") || industry.includes("apparel"))             return "combine refined editorial line, minimal tension, and quiet luxury into one precise mark";
  if (industry.includes("creative") || industry.includes("studio"))             return "combine bold geometric form, creative tension, and editorial clarity into one distinctive mark";
  if (industry.includes("finance") || industry.includes("fintech"))             return "combine stable base, upward arc, and growth line into one trustworthy mark";
  if (industry.includes("legal") || industry.includes("consulting"))            return "combine measured balance, clean lines, and authority into one credible stable mark";
  if (industry.includes("education"))                                            return "combine open path, spark of learning, and clear arc into one encouraging mark";
  if (industry.includes("real_estate") || industry.includes("real estate"))     return "combine refined arch, clean elevation, and premium space into one distinguished mark";
  const allText = (keywords + " " + notes).toLowerCase();
  if (allText.includes("nature") || allText.includes("plant") || allText.includes("organic") || allText.includes("botanical")) {
    return "combine botanical leaf, organic form, and clean geometric balance into one natural mark";
  }
  return "combine two compatible geometric forms into one clean, memorable brand mark";
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
  let specific = "";
  if (industry.includes("pet")) {
    if (animalTarget === "dog")                   specific = "unrelated animals, cartoon fur textures, ";
    else if (animalTarget === "cat")              specific = "unrelated animals, cartoon fur textures, ";
    else if (animalTarget === "dog_and_cat")      specific = "unrelated animals, cartoon fur textures, ";
    else                                          specific = "unrelated animals, cartoon fur textures, ";
  } else if (industry.includes("tech") || industry.includes("saas") || industry.includes("software")) {
    specific = "robots, hexagon clichés, circuit boards, AI sparkle overload, ";
  } else if (industry.includes("home") || industry.includes("decor")) {
    specific = "house clipart, room scene illustrations, overly rustic barn aesthetics, ";
  } else if (industry.includes("beauty") || industry.includes("skincare")) {
    specific = "product bottle illustrations, portrait faces, glitter, ";
  } else if (industry.includes("food") || industry.includes("beverage") || industry.includes("cafe") || industry.includes("restaurant")) {
    specific = "food photo realism, menu layouts, complex vintage badge overload, ";
  } else if (industry.includes("fitness") || industry.includes("sport")) {
    specific = "detailed athlete illustrations, gym equipment scenes, ";
  } else if (industry.includes("finance") || industry.includes("fintech")) {
    specific = "dollar signs, coins, candlestick charts, bank building drawings, ";
  } else if (industry.includes("legal") || industry.includes("consulting")) {
    specific = "scales-of-justice clipart, gavel drawings, ";
  } else if (industry.includes("health") || industry.includes("wellness")) {
    specific = "medical cross overuse, anatomy diagrams, lotus or mandala clichés, ";
  }
  return `avoid ${specific}random trademark symbols, meaningless micro text, unrelated objects, and clipart-like results`;
}

// Returns four concept-specific creative territories derived from brand input.
// Each concept gets a genuinely different design idea rather than a shared metaphor.
function planConceptDirections(industryRaw, animalTarget, brandName, keywords) {
  if (industryRaw.includes("pet")) {
    if (animalTarget === "dog") {
      return {
        recommended: "A warm, loyal dog brand identity — joyful, approachable, and genuinely lovable. Draw inspiration from: paw, tail, ear, collar, caring hands, heart, animal silhouette — one clear symbolic idea, integrated with the wordmark when possible. Find the mark that feels specific to this brand's spirit, not generic. Paired with the wordmark.",
        wordmark:    "The brand name with dog-brand warmth — characterful letterforms with personality. A paw curve, tail arc, or ear detail fused into a letterform when it makes the design more distinctive. No separate icon.",
        app_icon:    "A bold, warm mark that reads clearly at small sizes — draw from: paw, face, ear, collar shape, or heart. Expressive dog-brand energy. Brand name beside or below.",
        symbol_mark: "A standalone mark with genuine dog-brand character — a paw, silhouette, collar badge, or heart. Graphic, warm, and immediately lovable.",
      };
    }
    if (animalTarget === "cat") {
      return {
        recommended: "A graceful, confident cat brand identity — curious, elegant, and independent. Draw inspiration from: tail arc, ear silhouette, whisker form, paw, feline face — one clear symbolic idea integrated with the wordmark. Find the mark that captures this brand's particular feline personality. Paired with the wordmark.",
        wordmark:    "The brand name with feline elegance — refined letterforms with quiet confidence. A tail curve, ear peak, or whisker arc fused into a letter when it makes the design more distinctive. No separate icon.",
        app_icon:    "A compact mark with genuine cat-brand grace — draw from: tail curl, ear silhouette, feline face, or paw. Bold and elegant at small sizes. Brand name beside or below.",
        symbol_mark: "A standalone mark with real feline character — a tail arc, ear silhouette, or minimal cat form. Graceful, confident, and specific to this brand.",
      };
    }
    if (animalTarget === "dog_and_cat") {
      return {
        recommended: "A warm, inclusive pet family identity — the spirit of dogs and cats together. Draw from: shared paw, paired silhouette, heart, overlapping forms, caring hands — one clear symbolic idea that unites both without being generic. Paired with the wordmark.",
        wordmark:    "The brand name warm and welcoming — open, pet-loving letterforms. A shared paw, combined ear arc, or heart fused into a letter when it improves the design. No separate icon.",
        app_icon:    "A compact mark capturing shared pet warmth — draw from: shared paw, paired silhouette, or heart. Expressive and clear at small sizes. Brand name beside or below.",
        symbol_mark: "A standalone mark with genuine pet-family warmth — a shared paw, paired silhouette, or connecting heart form. Friendly and specific.",
      };
    }
    return {
      recommended: "A warm, character-driven pet brand identity — joyful, genuine, and specific. Draw from: paw, ear, tail, animal silhouette, caring hands, heart — one clear symbolic idea. Find the mark that captures this brand's particular animal spirit. Paired with the wordmark.",
      wordmark:    "The brand name with warm pet-brand character — approachable, genuine letterforms. A paw, ear, or collar detail fused into a letterform when it makes the design more distinctive. No separate icon.",
      app_icon:    "A bold, warm pet-brand mark — draw from: paw, face, tail, or heart. Expressive and clear at small sizes. Brand name beside or below.",
      symbol_mark: "A standalone mark with real pet-brand warmth — a paw, silhouette, or caring form. Specific and genuine, not a generic icon.",
    };
  }

  if (industryRaw.includes("outdoor") || industryRaw.includes("adventure") || industryRaw.includes("hiking") || industryRaw.includes("camping")) {
    return {
      recommended: "A bold, adventurous outdoor identity — the feeling of open landscapes and exploration. Draw inspiration from: mountain, tree, trail, tent, sun arc, camp badge, horizon line — one clear symbolic idea, integrated with the wordmark when possible. Paired with the wordmark.",
      wordmark:    "The brand name with outdoor character — strong, direct letterforms. A peak, trail mark, or terrain detail fused into a letterform when it makes the design more distinctive. No separate icon.",
      app_icon:    "A compact outdoor mark — draw from: mountain, sun arc, tree silhouette, or camp badge form. Bold and reads strongly at small sizes. Brand name beside or below.",
      symbol_mark: "A standalone outdoor symbol — a mountain, trail, or landscape form with a bold, graphic silhouette. The kind of mark that belongs on a badge or jacket patch.",
    };
  }

  if (industryRaw.includes("logistic") || industryRaw.includes("shipping") || industryRaw.includes("delivery") || industryRaw.includes("transport") || industryRaw.includes("freight") || industryRaw.includes("courier")) {
    return {
      recommended: "A clean, efficient logistics identity — precision, speed, and reliable movement. Draw inspiration from: arrow, route line, connected geometry, path, speed mark — one clear symbolic idea, integrated with the wordmark when possible. Paired with the wordmark.",
      wordmark:    "The brand name as a clean, forward-moving wordmark — strong letterforms with direction and momentum. A route line, arrow, or motion detail fused into a letterform when it makes the design more distinctive. No separate icon.",
      app_icon:    "A compact logistics mark — draw from: arrow, path, connected geometry, or speed form. Bold and reads clearly at small sizes. Brand name beside or below.",
      symbol_mark: "A standalone logistics symbol — a bold arrow, route, or geometric path with a strong directional silhouette.",
    };
  }

  if (industryRaw.includes("home") || industryRaw.includes("decor")) {
    return {
      recommended: "A refined, inviting home brand identity — the feeling of a beautifully considered space, made into a mark. Warm, personal, and crafted. Paired with the wordmark.",
      wordmark:    "The brand name as a warm, crafted wordmark — the kind of lettering that belongs on artisan packaging or a beautiful label. No separate icon.",
      app_icon:    "A compact mark evoking warmth and craft — something that feels designed and personal. Brand name below or beside it.",
      symbol_mark: "A standalone mark with home-brand warmth and consideration — designed and genuine, not generic decor imagery.",
    };
  }

  if (industryRaw.includes("tech") || industryRaw.includes("saas") || industryRaw.includes("software")) {
    return {
      recommended: "A clean, intelligent tech identity — clarity, precision, and forward motion without resorting to clichés. Draw inspiration from: spark, node, flow, intelligent signal, abstract mark — one clear concept-driven symbol that communicates what this brand actually does. Paired with the wordmark.",
      wordmark:    "The brand name as a sharp, deliberate wordmark — custom letterforms. A spark, node, or subtle signal detail fused into a letterform when it makes the design feel designed, not just set in a font. No separate icon.",
      app_icon:    "A bold, scalable mark ready for app icon use — draw from: spark, node, flow, signal, or abstract geometric. Concept-driven, reads perfectly at small sizes. Brand name beside or below.",
      symbol_mark: "A standalone geometric mark — draw from: spark, node, flow, or intelligent signal. Precise, memorable, concept-led. Something that becomes instantly recognizable.",
    };
  }

  if (industryRaw.includes("beauty") || industryRaw.includes("skincare")) {
    return {
      recommended: "A refined, premium beauty identity — calm, elevated, and genuinely beautiful. Something that belongs on luxury packaging. Paired with the wordmark.",
      wordmark:    "The brand name as a refined wordmark — graceful spacing and quiet luxury in every letterform. No separate icon.",
      app_icon:    "A compact, premium mark — minimal and confident, needing no explanation. Brand name below or beside it.",
      symbol_mark: "A standalone elegant mark — restrained, premium, with a silhouette that's genuinely beautiful and specific to this brand.",
    };
  }

  if (industryRaw.includes("food") || industryRaw.includes("beverage")) {
    return {
      recommended: "A warm, appetizing food brand identity — the craft and quality behind this brand, made visible. Genuine, not stock. Paired with the wordmark.",
      wordmark:    "The brand name with food-brand warmth — approachable, characterful letterforms that feel handmade and genuine. No separate icon.",
      app_icon:    "A compact mark with artisan food-brand personality — warm and inviting at small sizes. Brand name beside or below.",
      symbol_mark: "A standalone mark that captures this food brand's craft and character — genuine and specific to this brand.",
    };
  }

  if (industryRaw.includes("cafe") || industryRaw.includes("restaurant")) {
    return {
      recommended: "A warm, welcoming hospitality identity — the feeling of a great place to eat or drink, made into a mark. Something people would put on a tote bag. Paired with the wordmark.",
      wordmark:    "The brand name as warm, characterful lettering — the kind you'd see painted above a great neighborhood spot. No separate icon.",
      app_icon:    "A compact hospitality mark — bold and friendly, reads warmly at small sizes. Brand name below or beside it.",
      symbol_mark: "A standalone mark with genuine hospitality character — warm, confident, and specific to this place.",
    };
  }

  if (industryRaw.includes("health") || industryRaw.includes("wellness")) {
    return {
      recommended: "A calm, trustworthy wellness identity — serene, grounded, and genuinely reassuring. A mark that feels like it heals. Paired with the wordmark.",
      wordmark:    "The brand name as a calm, balanced wordmark — clean letterforms with quiet strength and natural rhythm. No separate icon.",
      app_icon:    "A compact mark evoking calm and wellbeing — simple, serene, and legible at small sizes. Brand name below or beside it.",
      symbol_mark: "A standalone wellness mark — organic, balanced, and genuinely calming. Not a generic cliché.",
    };
  }

  if (industryRaw.includes("fitness") || industryRaw.includes("sport")) {
    return {
      recommended: "A bold, energetic fitness identity — dynamic, powerful, and genuinely motivating. Draw inspiration from: motion cut, lightning bolt, strength angle, shield, speed arc — one clear symbolic idea integrated with the wordmark when possible. Something athletes would be proud to wear. Paired with the wordmark.",
      wordmark:    "The brand name as a bold, energetic wordmark — strong letterforms with forward momentum. A motion cut, lightning detail, or angle fused into a letterform when it makes the design more distinctive. No separate icon.",
      app_icon:    "A compact, high-impact mark — draw from: lightning bolt, shield, motion arc, or strength angle. Bold and kinetic at small sizes. Brand name below or beside it.",
      symbol_mark: "A standalone fitness mark — a lightning bolt, shield, motion arc, or strength form. Bold, dynamic, and graphic. The kind of mark that reads on a jersey.",
    };
  }

  if (industryRaw.includes("fashion") || industryRaw.includes("apparel")) {
    return {
      recommended: "A refined, editorial fashion identity — minimal, precise, and genuinely tasteful. The mark that belongs on premium packaging. Paired with the wordmark.",
      wordmark:    "The brand name as an editorial wordmark — custom letterforms with deliberate spacing and refined tension. No separate icon.",
      app_icon:    "A compact, minimal fashion mark — precise and confident at small sizes. Brand name beside or below it.",
      symbol_mark: "A standalone editorial mark — refined, graphic, with the confidence of a quiet luxury brand.",
    };
  }

  if (industryRaw.includes("creative") || industryRaw.includes("studio")) {
    return {
      recommended: "A bold, distinctive creative identity — something that demonstrates this studio's own taste and vision. The mark that feels genuinely designed, not assembled. Paired with the wordmark.",
      wordmark:    "The brand name as a signature wordmark — real typographic personality and creative confidence. The kind of wordmark a top studio makes for itself. No separate icon.",
      app_icon:    "A compact mark with creative studio confidence — distinctive and immediately recognizable. Brand name below or beside it.",
      symbol_mark: "A standalone mark that shows creative vision — distinctive, concept-led, and genuinely original.",
    };
  }

  if (industryRaw.includes("finance") || industryRaw.includes("fintech")) {
    return {
      recommended: "A trustworthy, precise finance identity — stable, modern, and genuinely credible. A mark that earns confidence. Paired with the wordmark.",
      wordmark:    "The brand name as a clean, authoritative wordmark — deliberate letterforms with professional clarity and confident spacing. No separate icon.",
      app_icon:    "A compact, precise mark — clean, stable, and legible at small sizes. Brand name below or beside it.",
      symbol_mark: "A standalone geometric mark — precise, trustworthy, and clean. The kind of mark that belongs on a card or a contract.",
    };
  }

  if (industryRaw.includes("legal") || industryRaw.includes("consulting")) {
    return {
      recommended: "A credible, authoritative professional identity — measured, confident, and genuinely trustworthy. A mark that signals expertise. Paired with the wordmark.",
      wordmark:    "The brand name as a clean, authoritative wordmark — strong letterforms with deliberate professional gravitas. No separate icon.",
      app_icon:    "A compact mark — balanced, precise, and professional. Brand name below or beside it.",
      symbol_mark: "A standalone mark with professional authority — stable, measured, and clean.",
    };
  }

  if (industryRaw.includes("education")) {
    return {
      recommended: "An encouraging, forward-looking education identity — open, inspiring, and genuinely trustworthy. A mark that feels like a good mentor. Paired with the wordmark.",
      wordmark:    "The brand name as an approachable, confident wordmark — clarity and forward momentum. No separate icon.",
      app_icon:    "A compact mark evoking learning and progress — clear and encouraging at small sizes. Brand name below or beside it.",
      symbol_mark: "A standalone mark with educational spirit — open, forward-looking, and hopeful.",
    };
  }

  if (industryRaw.includes("real_estate") || industryRaw.includes("real estate")) {
    return {
      recommended: "A premium, aspirational real estate identity — refined, trustworthy, and genuinely elegant. The mark that makes every sign look expensive. Paired with the wordmark.",
      wordmark:    "The brand name as a premium wordmark — strong letterforms with architectural confidence and deliberate spacing. No separate icon.",
      app_icon:    "A compact, premium mark — refined and legible at small sizes. Brand name below or beside it.",
      symbol_mark: "A standalone mark with real estate ambition — premium, distinctive, and architectural in feeling.",
    };
  }

  if (industryRaw.includes("wedding") || industryRaw.includes("event")) {
    return {
      recommended: "A romantic, premium wedding identity — genuine elegance, not a template. Draw inspiration from: botanical linework, ribbon, invitation seal, tiny heart, laurel wreath, vow-inspired detail — one clear symbolic idea integrated with the wordmark when possible. Find the mark that's graceful, emotionally warm, and quietly luxurious. If a subtitle is provided, include it as smaller supporting text near the primary mark when suitable. Paired with the wordmark.",
      wordmark:    "The brand name as a refined typographic wedding identity — elegant letterforms with genuine romantic character. A botanical detail, ribbon curve, or heart accent fused into a letterform when it improves the design. If a subtitle was provided, use it as supporting text when it improves the composition. No separate icon.",
      app_icon:    "A compact, refined emblem — draw from: botanical sprig, invitation seal, tiny heart, or laurel wreath. Elegant at small sizes and instantly recognizable as premium. If a subtitle is provided, include it as a small supporting line when suitable.",
      symbol_mark: "A standalone decorative mark — draw from: botanical linework, ribbon, heart, laurel, or graceful ornamental form. Genuinely romantic, not a cheesy cliché. If a subtitle is provided, include it as smaller supporting text when suitable.",
    };
  }

  return {
    recommended: "A memorable, distinctive brand identity — the most emotionally resonant mark possible for this brand, feeling invented and specific rather than generic. Paired with the wordmark.",
    wordmark:    "The brand name as a crafted wordmark — deliberate letterforms with personality and commercial polish. No separate icon.",
    app_icon:    "A bold, original mark — distinctive at small sizes. Brand name readable below or beside it.",
    symbol_mark: "A standalone symbol with a strong, memorable silhouette — concept-led and graphic. Paired with the brand name.",
  };
}

function buildConceptBriefPrompt(input, conceptKey) {
  const industryRaw = String(input?.industry || "").toLowerCase();
  const keywords = [
    String(input?.keywords  || ""),
    String(input?.styleCues || ""),
  ].filter(Boolean).join(" ").trim();
  const notes       = String(input?.otherNotes || input?.notes || "").trim();
  const typographyDir = String(input?.typographyDirection || "").trim();
  const brandName   = String(input?.brandName || "").trim();

  const petSearchText = [brandName, String(input?.industry || ""), keywords, notes].join(" ").toLowerCase();
  const animalTarget  = industryRaw.includes("pet") ? detectPetAnimal(petSearchText) : "none";

  const feeling    = buildFeelingFromKeywords(keywords, industryRaw);
  const shapes     = buildShapeDirection(industryRaw, keywords);
  const typography = buildTypographyDirection(typographyDir, industryRaw, keywords);
  const avoid      = buildAvoidDrift(industryRaw, animalTarget, keywords);

  const territories = planConceptDirections(industryRaw, animalTarget, brandName, keywords);
  const territory   = territories[conceptKey] || "";

  return `${territory} Feeling: ${feeling}. Shape: ${shapes}. Type: ${typography}. Avoid: ${avoid}.`;
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

// --- Minimal prompt experiment (Magic Prompt AUTO) ---

function buildMinimalIndustryCue(input) {
  const ind = String(input?.industry || "").toLowerCase();
  if (ind.includes("pet")) {
    const petText = [
      String(input?.brandName || ""),
      String(input?.industry  || ""),
      String(input?.keywords  || ""),
      String(input?.otherNotes || input?.notes || ""),
    ].join(" ").toLowerCase();
    const animalTarget = detectPetAnimal(petText);
    if (animalTarget === "dog")         return "Use broad pet brand cues such as paw, tail, ear, collar, caring hands, heart, animal silhouette, dog companion, playful warmth, loyal feeling, or pet lifestyle. One clear symbol integrated with the wordmark when possible.";
    if (animalTarget === "cat")         return "Use broad pet brand cues such as tail arc, ear silhouette, whisker form, paw, feline face, cat companion, graceful character, independent warmth, or pet lifestyle. One clear symbol integrated with the wordmark when possible.";
    if (animalTarget === "dog_and_cat") return "Use broad pet brand cues such as shared paw, paired animal silhouette, heart, caring hands, dog and cat companions, shared warmth, friendly character, or pet lifestyle. One clear symbol integrated with the wordmark when possible.";
    return "Use broad pet brand cues such as paw, tail, ear, animal silhouette, heart, caring hands, friendly animal companion, collar, playful warmth, or pet lifestyle. One clear symbol integrated with the wordmark when possible.";
  }
  if (ind.includes("home") || ind.includes("decor"))                  return "Use broad home decor cues such as botanical forms, home warmth, interior style, craft, shelter, cozy living, or lifestyle branding.";
  if (ind.includes("tech") || ind.includes("saas") || ind.includes("software")) return "Use broad software cues such as spark, node, flow, intelligent signal, abstract mark, cursor, window, clarity, or simple modern systems. One clear concept-driven symbol when it makes the mark more distinctive.";
  if (ind.includes("cafe") || ind.includes("coffee") || ind.includes("bakery") || ind.includes("restaurant") || ind.includes("food") || ind.includes("beverage")) return "Use broad food brand cues such as warmth, craft, cafe feeling, handmade quality, appetite, freshness, or friendly hospitality.";
  if (ind.includes("beauty") || ind.includes("skincare"))             return "Use broad beauty brand cues such as botanical refinement, soft natural forms, gentle elegance, skincare ritual, or premium lifestyle.";
  if (ind.includes("health") || ind.includes("wellness"))             return "Use broad wellness cues such as natural flow, calm balance, organic growth, gentle strength, or serene lifestyle.";
  if (ind.includes("fitness") || ind.includes("sport"))               return "Use broad fitness cues such as motion cut, lightning bolt, strength angle, shield, speed arc, dynamic letterform, energy, bold form, athletic character, or dynamic lifestyle. One clear symbol integrated with the brand text when possible.";
  if (ind.includes("fashion") || ind.includes("apparel"))             return "Use broad fashion brand cues such as editorial refinement, minimal tension, quiet luxury, or premium lifestyle.";
  if (ind.includes("creative") || ind.includes("studio"))             return "Use broad creative brand cues such as bold concept, editorial character, geometric confidence, or distinctive visual identity.";
  if (ind.includes("finance") || ind.includes("fintech"))             return "Use broad finance brand cues such as stability, trust, precision, clean geometry, or professional authority.";
  if (ind.includes("legal") || ind.includes("consulting"))            return "Use broad professional cues such as balance, authority, clean structure, measured form, or credible presence.";
  if (ind.includes("education"))                                       return "Use broad education cues such as open path, spark, learning, forward momentum, or encouraging clarity.";
  if (ind.includes("real_estate") || ind.includes("real estate"))     return "Use broad real estate cues such as architectural form, refined elevation, premium space, or aspirational living.";
  if (ind.includes("wedding") || ind.includes("event"))               return "Use broad wedding and events brand cues such as botanical linework, ribbon, invitation seal, tiny heart, laurel wreath, vow-inspired detail, graceful arch, interlocking initials, or refined celebration spirit. One clear symbol integrated with the wordmark when possible.";
  if (ind.includes("outdoor") || ind.includes("adventure") || ind.includes("hiking") || ind.includes("camping")) return "Use broad outdoor and adventure brand cues such as mountain, tree, trail, tent, sun arc, camp badge, horizon line, landscape form, nature spirit, or wilderness exploration. One clear symbol integrated with the wordmark when possible.";
  if (ind.includes("logistic") || ind.includes("shipping") || ind.includes("delivery") || ind.includes("transport") || ind.includes("freight") || ind.includes("courier")) return "Use broad logistics brand cues such as arrow, route line, path, speed mark, connected geometry, forward motion, direction, or reliable movement. One clear symbol integrated with the wordmark when possible.";
  return "";
}

function buildPaletteVariationCue(input) {
  const c = String(input?.colorDirection || "").toLowerCase().replace(/_/g, " ");
  if (!c) return "";
  if (c.includes("green") || c.includes("natural") || c.includes("sage") || c.includes("forest") || c.includes("olive"))
    return "Within the green/natural direction, explore tasteful palette variation such as sage green, deep forest green, olive, warm cream, soft beige, natural brown, or muted clay accents.";
  if (c.includes("orange") || c.includes("yellow") || c.includes("amber") || c.includes("warm"))
    return "Within the warm orange/yellow direction, explore tasteful palette variation such as terracotta, warm amber, soft cream, muted gold, clay, tan, or cocoa accents.";
  if (c.includes("blue") || c.includes("navy") || c.includes("sky") || c.includes("slate"))
    return "Within the blue direction, explore tasteful palette variation such as navy, soft sky blue, slate blue, mist blue, off-white, or cool gray accents.";
  if ((c.includes("black") && c.includes("gold")) || c.includes("champagne") || c.includes("bronze"))
    return "Within the black/gold direction, explore tasteful palette variation such as matte black, warm gold, champagne, ivory, charcoal, or muted bronze.";
  if ((c.includes("black") && c.includes("white")) || c.includes("monochrome") || c.includes("grayscale"))
    return "Keep the palette mostly monochrome, but explore contrast, spacing, and shape personality rather than adding extra colors.";
  if (c.includes("bright") || c.includes("vibrant") || c.includes("bold color") || c.includes("colorful"))
    return "Use bright colors tastefully with one dominant color and one or two supporting accents.";
  if (c.includes("custom"))
    return "Use the user's custom color as the anchor, with subtle supporting tones that stay harmonious.";
  return "";
}

function buildAllowedVisibleTextCue(input) {
  const brandName = String(input?.brandName || "Brand").trim();
  const userText = [
    String(input?.notes      || ""),
    String(input?.otherNotes || ""),
    String(input?.keywords   || ""),
    String(input?.styleCues  || ""),
  ];
  if (input?.conceptPrompts && typeof input.conceptPrompts === "object") {
    for (const val of Object.values(input.conceptPrompts)) {
      if (typeof val === "string") userText.push(val);
    }
  }
  const userStr = userText.join(" ").toUpperCase();
  const ALLOWED_DESCRIPTORS = [
    "HOME + DECOR",
    "HOME & DECOR",
    "PETS",
    "STUDIO",
    "CAFE",
    "BAKERY",
    "WELLNESS",
    "BEAUTY",
    "SKINCARE",
  ];
  let descriptor = null;
  for (const d of ALLOWED_DESCRIPTORS) {
    if (userStr.includes(d)) {
      descriptor = d;
      break;
    }
  }
  return { brandName, descriptor };
}

function buildReferenceStyleCue(analysis) {
  if (!analysis?.safePromptFragment) return "";
  const parts = [];
  if (analysis.styleDescription) parts.push(`Overall visual language: ${analysis.styleDescription}.`);
  if (analysis.shapeLanguage)    parts.push(`Shape language: ${analysis.shapeLanguage}.`);
  if (analysis.composition)      parts.push(`Composition structure: ${analysis.composition}.`);
  if (analysis.iconFeel)         parts.push(`Mark construction approach (visual weight and geometry only — not the reference subject type): ${analysis.iconFeel}.`);
  // colorPalette is a feel hint only — user colorDirection/colorTheme takes precedence
  if (analysis.colorPalette)     parts.push(`Color feel (hint only — user color direction takes precedence): ${analysis.colorPalette}.`);
  if (analysis.detailLevel)      parts.push(`Detail level: ${analysis.detailLevel}.`);
  parts.push(`Apply this visual construction style to the user's chosen subject — do not apply the reference image's subject: ${analysis.safePromptFragment}`);
  return (
    "REFERENCE STYLE GUIDE — use only for: geometric construction, shape language, composition structure, " +
    "negative space approach, visual weight, and finish level. " +
    "Do NOT use the reference image's subject, character type, animal type, icon type, or depicted object. " +
    "The subject and icon of this logo must come from the user's brief, not from the reference image. " +
    "Do not copy brand identity, trademarks, text, exact shapes, mascots, outlines, or proprietary details: " +
    parts.join(" ")
  );
}

function buildTargetSubjectCue(subjectSearchText, hasReference, hasUserBrief) {
  if (!hasReference) return "";

  const animalKey = detectLogoAnimal(subjectSearchText);

  if (animalKey) {
    const traits = ANIMAL_TRAITS[animalKey] || "";
    const cap    = animalKey.charAt(0).toUpperCase() + animalKey.slice(1);
    let block = `${cap.toUpperCase()} MARK — apply the reference image's construction style to a ${animalKey} subject: `;
    block += `The icon in this logo is a ${animalKey} or ${animalKey}-inspired mark. `;
    if (traits) block += `Draw clear ${animalKey} visual traits: ${traits}. `;
    block += `Build this ${animalKey} form using the geometric construction, rounded shapes, compact weight, and negative space approach from the reference image. `;
    block += `The mark must read clearly as a ${animalKey} — not a generic animal, not an abstract shape.`;
    return block;
  }

  if (hasUserBrief) {
    return (
      "TARGET SUBJECT — use the subject explicitly requested in the user's brief. " +
      "Make it recognizable through its most distinctive simple silhouette traits while keeping the mark clean, geometric, and logo-like. " +
      "Do not default to the reference image's animal, object, character, or mascot."
    );
  }

  return "";
}

function buildAnimalConceptAngle(conceptKey, animalKey) {
  if (!animalKey) return null;
  if (conceptKey === "recommended") {
    return (
      `Explore a complete commercial logo lockup: a clear friendly ${animalKey} or ${animalKey}-inspired ` +
      `symbol mark paired with the brand name wordmark. ` +
      `The ${animalKey} symbol is the primary visual element — warm, recognizable, and logo-ready. ` +
      `The composition should feel like a polished commercial brand identity.`
    );
  }
  if (conceptKey === "wordmark") {
    return (
      `Explore a lettering-led wordmark where the brand name is the primary visual element. ` +
      `Optionally integrate a subtle ${animalKey}-inspired accent — such as a distinctive ear curve, ` +
      `tail arc, or silhouette detail — into one letterform as a crafted accent. ` +
      `The wordmark is the hero; any animal element is an integrated letterform detail, not a separate floating icon.`
    );
  }
  if (conceptKey === "app_icon") {
    return (
      `Explore a compact ${animalKey} head or ${animalKey}-inspired icon mark — ` +
      `bold clean silhouette, recognizable at small sizes. ` +
      `One centered composition: the compact ${animalKey} icon with the brand name clearly readable below or beside it. ` +
      `One unified composition only on a plain background.`
    );
  }
  if (conceptKey === "symbol_mark") {
    return (
      `Explore the boldest standalone ${animalKey} or ${animalKey}-inspired symbol — ` +
      `stripped to its most essential silhouette, graphic and powerful. ` +
      `The mark should work as a standalone emblem, clean on white, with the frame focused on the ${animalKey} symbol only.`
    );
  }
  return null;
}

// Strip clauses from user-supplied notes that would ask the image model to render
// extra text elements or presentation layouts (taglines, body copy, boards, etc.).
const USER_NOTES_STRIP_RE = /\b(tagline|slogan|presentation[\s-]?board|brand[\s-]?board|style[\s-]?guide|body[\s-]?copy|paragraph|caption|footnote|show multiple|multiple (logo )?versions?|description below|add text)\b/i;

function sanitizeUserNotes(text) {
  if (!text) return text;
  return text
    .split(/[.!?\n;]+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0 && !USER_NOTES_STRIP_RE.test(clause))
    .join(". ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function buildMinimalConceptPrompt(input, conceptKey, conceptOverride, track = "commercial") {
  const brandName     = String(input?.brandName || "Brand").trim();
  const industry      = String(input?.industry  || "").replace(/_/g, " ").trim();
  const keywords      = [
    String(input?.keywords  || ""),
    String(input?.styleCues || ""),
  ].filter(Boolean).join(", ").trim();
  const notes         = sanitizeUserNotes(String(input?.otherNotes || input?.notes || "").trim());
  const colorDir      = String(input?.colorDirection || "").replace(/_/g, " ").trim();
  const typographyDir = String(
    input?.typographyDirection || input?.typographyStyle || input?.fontStyle || ""
  ).replace(/_/g, " ").trim();
  const styles = String(
    input?.style || input?.styles || input?.selectedStyles || input?.styleOptions || ""
  ).replace(/,/g, ", ").trim();
  const iconDir = String(
    input?.iconDirection || input?.icon || input?.icons || input?.selectedIcons || input?.iconOptions || ""
  ).replace(/,/g, ", ").trim();
  const detail = String(
    input?.detail || input?.detailLevel || input?.detailPreference || ""
  ).trim();
  const subtitle = String(input?.subtitle || input?.tagline || "").trim();

  const CONCEPT_ANGLES = {
    recommended: "Explore the strongest complete logo lockup with clear brand hierarchy.",
    wordmark:    "Explore a lettering-led wordmark where the brand name is the complete design. Do not place a separate large icon above the wordmark. Any visual detail should be integrated into the letterforms.",
    app_icon:    "Explore a compact icon-first logo: one centered mark, monogram, or simple industry symbol with the brand name clearly readable below or beside it. One unified composition only on a plain background.",
    symbol_mark: "Explore an independent symbol or emblem paired with the brand name clearly readable below or beside it. One centered composition only on a plain background.",
  };

  const industryPhrase = industry ? `a ${industry} brand` : "a brand";
  const brandIntro = `Create a creative commercial logo for ${brandName}, ${industryPhrase}.`;

  const referenceStyleCue = buildReferenceStyleCue(input?.referenceAnalysis);

  const subjectSearchText = [
    String(input?.brandName  || ""),
    String(input?.industry   || ""),
    String(input?.keywords   || ""),
    String(input?.styleCues  || ""),
    String(input?.otherNotes || input?.notes || ""),
  ].join(" ").toLowerCase();
  const hasUserBrief = Boolean(notes || keywords);
  const targetSubjectCue = buildTargetSubjectCue(subjectSearchText, Boolean(referenceStyleCue), hasUserBrief);

  const userDirection = [keywords, notes].filter(Boolean).join(". ");
  const userBriefPart = userDirection
    ? `User brief (do not render as visible text in the logo): ${userDirection}.`
    : "";

  const { descriptor } = buildAllowedVisibleTextCue(input);
  const subtitleClause = (subtitle && track === "commercial")
    ? ` and the subtitle '${subtitle}' as smaller supporting text near the primary mark when suitable`
    : "";
  let textLock;
  if (conceptKey === "recommended") {
    textLock = descriptor
      ? `Use only the specified brand text: the brand name '${brandName}'${subtitleClause} and the descriptor '${descriptor}'. Do not add random extra words.`
      : `Use only the specified brand text: the brand name '${brandName}'${subtitleClause}. Do not add random extra words.`;
  } else if (conceptKey === "wordmark") {
    textLock = `Use only the specified brand text: the brand name '${brandName}'${subtitleClause}. The wordmark is the complete design. Do not add random extra words.`;
  } else if (conceptKey === "app_icon") {
    textLock = `Use only the specified brand text: the brand name '${brandName}'${subtitleClause}. Keep it clean and readable. Do not add random extra words.`;
  } else if (conceptKey === "symbol_mark") {
    textLock = `Use only the specified brand text: the brand name '${brandName}'${subtitleClause}, or just the symbol if it stands alone. Do not add random extra words.`;
  } else {
    textLock = `Use only the specified brand text: the brand name '${brandName}'${subtitleClause}. Do not add random extra words.`;
  }

  const paletteCue = buildPaletteVariationCue(input);

  const animalKey    = detectLogoAnimal(subjectSearchText);
  const industryConceptDirections = planConceptDirections(
    String(input?.industry || "").toLowerCase(),
    String(input?.industry || "").toLowerCase().includes("pet")
      ? detectPetAnimal(subjectSearchText)
      : "none",
    brandName,
    keywords
  );
  const industryConceptAngle = industryConceptDirections[conceptKey] || "";
  const conceptAngle = conceptOverride
    || (referenceStyleCue && buildAnimalConceptAngle(conceptKey, animalKey))
    || industryConceptAngle
    || CONCEPT_ANGLES[conceptKey]
    || "";

  const industryCue = buildMinimalIndustryCue(input);

  const parts = [];

  const CREATIVE_SAFETY =
    "One standalone logo mark on a plain white background only. " +
    "Do not include ® symbols, ™ symbols, © symbols, or any legal marks. " +
    "Do not create a brand guideline page, style board, multi-panel layout, or color/type specimen. " +
    "Do not add decorative captions, explanatory labels, or descriptors outside the brand name.";

  if (track === "creative") {
    parts.push(brandIntro);
    parts.push(CREATIVE_SAFETY);
    parts.push("Approach this with maximum creative freedom. Express the brand's concept through unexpected visual ideas, bold symbolism, and original mark-making.");
    if (conceptAngle)      parts.push(`${conceptAngle} This direction should look visually distinct from the other logo concepts.`);
    if (industryCue)       parts.push(industryCue);
    if (referenceStyleCue) parts.push(referenceStyleCue);
    if (targetSubjectCue)  parts.push(targetSubjectCue);
    if (userBriefPart)     parts.push(userBriefPart);
    parts.push(textLock);
    if (colorDir)          parts.push(`Color direction: ${colorDir}.`);
    if (paletteCue)        parts.push(paletteCue);
    if (typographyDir)     parts.push(`Typography: ${typographyDir}.`);
    parts.push("Make it feel polished, memorable, and suitable for actual use.");
  } else if (track === "symbol_fusion") {
    parts.push(brandIntro);
    parts.push(CREATIVE_SAFETY);
    parts.push("Create a symbol fusion logo where the brand's core concept is fused into a bold abstract mark. The symbol and letter become one — a hybrid where a letterform becomes an icon or the icon becomes a letterform. The creative challenge is in the invented form of the mark itself. The result is one finished logo on a clean white background — not a brand board, not a style guide, not a presentation.");
    if (conceptAngle)      parts.push(`${conceptAngle} This direction should look visually distinct from the other logo concepts.`);
    if (industryCue)       parts.push(industryCue);
    if (referenceStyleCue) parts.push(referenceStyleCue);
    if (targetSubjectCue)  parts.push(targetSubjectCue);
    if (userBriefPart)     parts.push(userBriefPart);
    parts.push(textLock);
    if (colorDir)          parts.push(`Color direction: ${colorDir}.`);
    if (paletteCue)        parts.push(paletteCue);
    parts.push("Make it feel polished, memorable, and suitable for actual use.");
  } else {
    // commercial — current behavior unchanged
    parts.push(brandIntro);
    if (referenceStyleCue) parts.push(referenceStyleCue);
    if (targetSubjectCue)  parts.push(targetSubjectCue);
    if (userBriefPart)     parts.push(userBriefPart);
    parts.push(textLock);
    if (styles)            parts.push(`Style: ${styles}.`);
    if (colorDir)          parts.push(`Color direction: ${colorDir}.`);
    if (paletteCue)        parts.push(paletteCue);
    if (typographyDir)     parts.push(`Typography: ${typographyDir}.`);
    if (iconDir)           parts.push(`Icon direction: ${iconDir}.`);
    if (detail)            parts.push(`Detail level: ${detail}.`);
    if (conceptAngle)      parts.push(`${conceptAngle} This direction should look visually distinct from the other logo concepts.`);
    if (industryCue)       parts.push(industryCue);
    parts.push("Make it feel polished, memorable, and suitable for actual use.");
  }

  return parts.join(" ");
}

function buildIdeogramPrompt(input = {}, groupIndex = 0, track = "commercial") {
  const CONCEPT_PROMPT_KEYS = ["recommended", "wordmark", "app_icon", "symbol_mark"];
  const conceptKey = CONCEPT_PROMPT_KEYS[groupIndex];
  if (
    conceptKey &&
    input?.conceptPrompts != null &&
    typeof input.conceptPrompts === "object" &&
    typeof input.conceptPrompts[conceptKey] === "string" &&
    input.conceptPrompts[conceptKey].trim()
  ) {
    const TRACK_MAGIC = { commercial: "OFF", creative: "AUTO", symbol_fusion: "AUTO" };
    const parts = [
      buildMinimalConceptPrompt(input, conceptKey, null, track),
      MINIMAL_CONCEPT_SUFFIX,
    ];

    if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
      console.log("[prompt-debug] path=conceptPrompts conceptKey=%s track=%s promptPreview=%j",
        conceptKey, track, dbgSlice(parts.join(" "), 600));
    }
    return {
      prompt: parts.join(" "),
      style_name: "logofunny",
      conceptLabel: conceptKey,
      magicPromptOverride: TRACK_MAGIC[track] ?? "OFF",
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
    "Color palette: bright saturated tech blue as the dominant anchor color. Use vivid electric blue (not dark navy, not steel, not indigo) prominently in the symbol mark and/or wordmark. Supporting tones may include off-white or cool light gray only. Do not create a monochrome, charcoal-only, or black-only logo. Blue must be clearly visible in the final image.";

  /** @type {Record<string, string>} */
  const CD_MAP = {
    black_white_first: "Color palette: monochrome-first, black and white friendly.",
    classic_mono:      "Color palette: monochrome-first, black and white friendly.",
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
    String(input?.otherNotes || input?.notes || ""),
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
  const referenceStyleCue = buildReferenceStyleCue(input?.referenceAnalysis);
  const targetSubjectCue = buildTargetSubjectCue(
    [brandName, industryRaw, keywords, styleCues, otherNotes].join(" ").toLowerCase(),
    Boolean(referenceStyleCue),
    Boolean(otherNotes || keywords)
  );
  const exclusionTag =
    "Plain white background only. Standalone logo mark on white. " +
    "No photo scene, no lifestyle imagery, no mockup, no product shot, no table, no cup, " +
    "no environment, no background texture, no gradient backdrop, no people, no hands, no mascots.";

  const backgroundTag = "Centered composition on plain white background. Vector-style flat graphic design.";

  const prompt = [
    `Flat vector logo design for "${brandName}".`,
    referenceStyleCue,
    targetSubjectCue,
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

  const referenceImageUrl = (typeof input.referenceImageUrl === "string" && input.referenceImageUrl.trim())
    ? input.referenceImageUrl.trim()
    : null;
  const hasStyleReference    = Boolean(referenceImageUrl);
  const hasReferenceAnalysis = Boolean(input?.referenceAnalysis?.safePromptFragment);
  const styleReferenceStrength = 0.75;
  console.log("[ideogram] hasStyleReference=%s styleReferenceStrength=%s hasReferenceAnalysis=%s", hasStyleReference, styleReferenceStrength, hasReferenceAnalysis);

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
      const creativeTracks = process.env.LOGOFUNNY_IDEOGRAM_CREATIVE_TRACKS === "true";
      const TRACK_ASSIGNMENTS = ["commercial", "commercial", "creative", "symbol_fusion"];
      const track = creativeTracks ? (TRACK_ASSIGNMENTS[conceptIndex] || "commercial") : "commercial";
      if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
        console.log("[ideogram-track] conceptIndex=%d track=%s creativeTracks=%s", conceptIndex, track, creativeTracks);
      }
      let { prompt, style_name, conceptLabel, magicPromptOverride } = buildIdeogramPrompt(input, conceptIndex, track);
      if (hasStyleReference) {
        prompt = prompt + " Use the uploaded reference image as a strong visual style guide only. Strongly follow its overall visual language, such as shape language, composition, color mood, line weight, simplicity level, icon or mascot feel, and layout. Create a new original logo for the requested brand. Do not copy exact artwork, text, brand names, trademarks, or protected logos from the reference.";
      }
      const resolvedMagicPrompt = VALID_MAGIC_PROMPT.has(magicPromptOverride ?? "")
        ? magicPromptOverride
        : globalMagicPrompt;

      if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
        console.log("[ideogram-request] conceptIndex=%d num_images=%d magic_prompt=%s style_type=DESIGN aspect_ratio=1x1 rendering_speed=QUALITY hasStyleReference=%s promptPreview=%j",
          conceptIndex, numImages, resolvedMagicPrompt, hasStyleReference, dbgSlice(prompt, 600));
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
          // Style reference: field name and strength can be adjusted if Ideogram schema changes.
          ...(hasStyleReference ? { style_reference: { url: referenceImageUrl, strength: styleReferenceStrength } } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("[ideogram-request] API error conceptIndex=%d hasStyleReference=%s status=%d", conceptIndex, hasStyleReference, response.status);
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
  planConceptDirections,
  buildMinimalIndustryCue,
  buildPaletteVariationCue,
  detectPetAnimal,
};
