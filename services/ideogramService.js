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
  "No stray marks, trademark symbols, or random meaningless text near the brand name. " +
  "No brand boards, mockups, or multiple versions in one image.";

// Minimal guardrails for the Magic Prompt AUTO experiment.
const MINIMAL_CONCEPT_SUFFIX =
  "One logo only. Plain clean background. No mockups, brand boards, or multiple versions in one image. Avoid random trademark symbols or meaningless tiny text. " +
  "The logo mark, lettering, negative-space shapes, and any integrated letterform ideas must look complete, intentional, and fully formed. " +
  "No half-drawn symbols, broken shapes, missing edges, incomplete outlines, cropped letter details, malformed negative space, or unfinished-looking marks. " +
  "If a letterform is modified, it must still look like a complete readable letter. If negative space is used, it must be clear, closed, and intentional. " +
  "If secondary text is used, use only clear real words provided by the user, such as HOME + DECOR; do not invent or misspell tiny text.";

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
        recommended: "A warm dog companion lockup — a friendly dog face, collar tag badge, or bold paw shape as a symbol, paired with the wordmark. Polished commercial finish.",
        wordmark:    "A lettering-led wordmark where a dog tail curve, paw element, or collar arc is integrated into the brand name letterforms. No separate icon.",
        app_icon:    "A compact friendly dog head or paw icon for avatar use — bold, warm silhouette, no wordmark. Legible at small sizes.",
        symbol_mark: "A standalone dog mark — a collar badge, paw rhythm pattern, or bold dog silhouette that works independently.",
      };
    }
    if (animalTarget === "cat") {
      return {
        recommended: "A graceful cat companion lockup — a cat face silhouette, arched tail curve, or whisker arc as a refined symbol, paired with the wordmark. Polished commercial finish.",
        wordmark:    "A lettering-led wordmark where a cat ear, tail curve, or whisker arc is integrated into the brand name letterforms. No separate icon.",
        app_icon:    "A compact cat face or tail curl icon for avatar use — elegant, minimal silhouette, no wordmark. Legible at small sizes.",
        symbol_mark: "A standalone cat mark — a graceful cat silhouette, tail arc, or ear-and-whisker form that works independently.",
      };
    }
    if (animalTarget === "dog_and_cat") {
      return {
        recommended: "A shared pet-family lockup — a paired paw, dog-and-cat silhouette, or friendly dual-pet mark as a symbol, paired with the wordmark. Warm and polished.",
        wordmark:    "A lettering-led wordmark where a shared pet element — a paw, combined ear shape, or friendly arc — is integrated into the letterforms. No separate icon.",
        app_icon:    "A compact paired pet or shared paw icon for avatar use — warm, simple, no wordmark. Legible at small sizes.",
        symbol_mark: "A standalone pet-family mark — a shared paw print, paired pet silhouette, or combined dog-and-cat form that works independently.",
      };
    }
    return {
      recommended: "A warm friendly pet lockup — a paw, pet face, or collar tag as a clean symbol, paired with the wordmark. Warm and polished.",
      wordmark:    "A lettering-led wordmark where a paw, ear, or collar detail is integrated into the brand name letterforms. No separate icon.",
      app_icon:    "A compact pet face or paw icon for avatar use — friendly bold silhouette, no wordmark. Legible at small sizes.",
      symbol_mark: "A standalone pet mark — a bold paw, pet face silhouette, or collar badge that works independently.",
    };
  }

  if (industryRaw.includes("home") || industryRaw.includes("decor")) {
    return {
      recommended: "A botanical shelter lockup — a leaf or bloom nestled inside a sheltering home arch as a refined symbol, paired with the wordmark. Include a HOME + DECOR descriptor in small caps below the wordmark.",
      wordmark:    "A lettering-led wordmark where a botanical detail — a leaf extension, bloom counter, or nest curve — is integrated into one or two letters of the brand name. No separate icon.",
      app_icon:    "A compact nest or bloom icon — a rounded nest cradling a small sprout, or a stylized bloom circle. Bold and legible at small sizes. No wordmark.",
      symbol_mark: "A standalone botanical emblem — a leaf arch, nest silhouette, or bloom mark with a strong independent silhouette that works alone.",
    };
  }

  if (industryRaw.includes("tech") || industryRaw.includes("saas") || industryRaw.includes("software")) {
    return {
      recommended: "A clean modern symbol + wordmark lockup — a concept-driven spark, node, cursor, or flow shape as a symbol, paired with the wordmark. Geometric precision and polish.",
      wordmark:    "A clean geometric wordmark with a subtle spark, cursor, node, or motion cue integrated into one letterform. Typography-first. No separate icon.",
      app_icon:    "A compact app-ready symbol — a single bold geometric form, spark, or node that reads clearly as a favicon and avatar icon. No wordmark.",
      symbol_mark: "A standalone abstract symbol — a precise geometric mark with a strong independent silhouette derived from the brand idea.",
    };
  }

  if (industryRaw.includes("beauty") || industryRaw.includes("skincare")) {
    return {
      recommended: "A refined botanical lockup — a soft petal, bloom, or drop form as an elegant symbol, paired with the wordmark. Premium spacing and finish.",
      wordmark:    "A lettering-led wordmark with a soft botanical or drop detail integrated into one letter. Elegant premium typography. No separate icon.",
      app_icon:    "A compact bloom or drop icon — a single petal form or elegant circular mark. Minimal and refined. No wordmark.",
      symbol_mark: "A standalone botanical mark — a refined petal silhouette, bloom form, or drop shape with premium finish that works independently.",
    };
  }

  if (industryRaw.includes("food") || industryRaw.includes("beverage")) {
    return {
      recommended: "A warm artisan lockup — a leaf, grain, or ingredient symbol paired with the wordmark. Clean and appetizing with artisan character.",
      wordmark:    "A lettering-led wordmark where a leaf, grain, or natural detail is integrated into the letterforms. Warm and approachable. No separate icon.",
      app_icon:    "A compact leaf or ingredient icon — a bold simple organic form at small sizes. No wordmark.",
      symbol_mark: "A standalone artisan mark — a leaf, grain, or botanical silhouette with a clean legible form that works independently.",
    };
  }

  if (industryRaw.includes("cafe") || industryRaw.includes("restaurant")) {
    return {
      recommended: "A warm hospitality lockup — a steam arc, cup form, or bean shape as a symbol, paired with the wordmark. Inviting and storefront-ready.",
      wordmark:    "A lettering-led wordmark where a steam arc, cup handle, or bean curve is subtly integrated into the letterforms. Warm character. No separate icon.",
      app_icon:    "A compact cup or bean icon — a bold simple form for avatar and app use. No wordmark.",
      symbol_mark: "A standalone hospitality mark — a cup silhouette, steam arc, or bean form with a strong shape that works independently.",
    };
  }

  if (industryRaw.includes("health") || industryRaw.includes("wellness")) {
    return {
      recommended: "A calm balanced lockup — a leaf arc, organic flow, or gentle circle as a refined symbol, paired with the wordmark. Trustworthy and serene.",
      wordmark:    "A lettering-led wordmark with a leaf, arc, or flow detail integrated into one letter. Calm and natural. No separate icon.",
      app_icon:    "A compact leaf or flow icon — a serene organic form at small sizes. No wordmark.",
      symbol_mark: "A standalone wellness mark — a leaf arc, flow form, or balanced organic shape with a clear silhouette that works independently.",
    };
  }

  if (industryRaw.includes("fitness") || industryRaw.includes("sport")) {
    return {
      recommended: "A bold energetic lockup — a motion arc, speed line, or strong geometric silhouette as a dynamic symbol, paired with the wordmark. High impact and commercial finish.",
      wordmark:    "A bold lettering-led wordmark where a motion arc or speed line is integrated into the letterforms. Energetic. No separate icon.",
      app_icon:    "A compact bold mark — a motion arc, strong geometric form, or bold initial for avatar use. No wordmark.",
      symbol_mark: "A standalone dynamic mark — a bold motion arc, kinetic silhouette, or geometric strength form that works independently.",
    };
  }

  if (industryRaw.includes("fashion") || industryRaw.includes("apparel")) {
    return {
      recommended: "A refined editorial lockup — a minimal geometric line or precision mark as a symbol, paired with the wordmark. Quiet luxury and premium spacing.",
      wordmark:    "An editorial lettering-led wordmark with precise custom spacing, deliberate weight, and refined character. No separate icon.",
      app_icon:    "A compact editorial mark — a refined geometric form or stylized initial. Minimal and precise. No wordmark.",
      symbol_mark: "A standalone editorial mark — a refined line, geometric tension, or typographic form with premium finish that works independently.",
    };
  }

  if (industryRaw.includes("creative") || industryRaw.includes("studio")) {
    return {
      recommended: "A bold editorial lockup — a distinctive geometric concept symbol, paired with the wordmark. Strong typographic presence and creative confidence.",
      wordmark:    "A lettering-led wordmark with a distinctive typographic personality — bold custom spacing, a signature letterform modification, or a visual cue integrated into one letter. No separate icon.",
      app_icon:    "A compact bold mark or stylized initial — a strong geometric form or editorial symbol for avatar use. No wordmark.",
      symbol_mark: "A standalone creative mark — a bold geometric concept, editorial form, or signature mark with a distinctive silhouette that works independently.",
    };
  }

  if (industryRaw.includes("finance") || industryRaw.includes("fintech")) {
    return {
      recommended: "A trustworthy professional lockup — a stable geometric mark or upward arc as a symbol, paired with the wordmark. Clean, precise, and authoritative.",
      wordmark:    "A clean professional wordmark with strong geometric letterforms and deliberate spacing. No separate icon.",
      app_icon:    "A compact geometric mark — a stable form or stylized initial. Clean and trustworthy. No wordmark.",
      symbol_mark: "A standalone geometric mark — a stable base, upward arc, or balanced form with clean authority that works independently.",
    };
  }

  if (industryRaw.includes("legal") || industryRaw.includes("consulting")) {
    return {
      recommended: "A credible professional lockup — a measured geometric or balanced mark as a symbol, paired with the wordmark. Authoritative and clean.",
      wordmark:    "A clean authoritative wordmark with strong readable letterforms and deliberate professional spacing. No separate icon.",
      app_icon:    "A compact professional mark — a balanced geometric form or stylized initial. Clean authority. No wordmark.",
      symbol_mark: "A standalone authoritative mark — a measured balanced form with clean lines and strong professional presence that works independently.",
    };
  }

  if (industryRaw.includes("education")) {
    return {
      recommended: "An encouraging professional lockup — an open path, arc, or spark-of-learning symbol paired with the wordmark. Clear structure and forward momentum.",
      wordmark:    "A lettering-led wordmark with a spark, arc, or path detail integrated into a letterform. Approachable and trustworthy. No separate icon.",
      app_icon:    "A compact spark or arc icon — a clear encouraging form at small sizes. No wordmark.",
      symbol_mark: "A standalone learning mark — an open arc, spark form, or forward-motion shape with a clear silhouette that works independently.",
    };
  }

  if (industryRaw.includes("real_estate") || industryRaw.includes("real estate")) {
    return {
      recommended: "A premium architectural lockup — a refined arch, clean elevation, or geometric home form as a symbol, paired with the wordmark. Aspirational and trustworthy.",
      wordmark:    "A lettering-led wordmark with a subtle arch, roofline, or elevation detail integrated into one letter. Premium and readable. No separate icon.",
      app_icon:    "A compact arch or geometric mark — a refined architectural form or stylized initial. Premium finish. No wordmark.",
      symbol_mark: "A standalone architectural mark — a clean arch, refined elevation, or geometric form with a strong premium silhouette that works independently.",
    };
  }

  return {
    recommended: "A complete commercial logo lockup — a memorable concept-driven symbol paired with a refined wordmark. Mature spacing, clear hierarchy, and packaging-ready polish.",
    wordmark:    "A lettering-led wordmark — the brand name is the hero. Mature custom typography with subtle integrated visual cue only if it improves personality and readability. No separate icon.",
    app_icon:    "A compact icon or avatar mark — a bold symbol, abstract mark, or single initial designed for small sizes. No full wordmark.",
    symbol_mark: "A standalone symbol mark — a concept-driven mark with a strong independent silhouette, paired with a small wordmark below.",
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
    if (animalTarget === "dog")         return "Use broad pet brand cues such as dog companion, paw, collar, playful warmth, friendly character, loyal feeling, or pet lifestyle.";
    if (animalTarget === "cat")         return "Use broad pet brand cues such as cat companion, whisker, tail, graceful character, independent warmth, feline elegance, or pet lifestyle.";
    if (animalTarget === "dog_and_cat") return "Use broad pet brand cues such as paw, dog and cat companions, shared warmth, friendly character, or pet lifestyle.";
    return "Use broad pet brand cues such as paw, friendly animal companion, collar, playful warmth, or pet lifestyle.";
  }
  if (ind.includes("home") || ind.includes("decor"))                  return "Use broad home decor cues such as botanical forms, home warmth, interior style, craft, shelter, cozy living, or lifestyle branding.";
  if (ind.includes("tech") || ind.includes("saas") || ind.includes("software")) return "Use broad software cues such as clarity, flow, spark, node, cursor, window, intelligence, or simple modern systems.";
  if (ind.includes("cafe") || ind.includes("coffee") || ind.includes("bakery") || ind.includes("restaurant") || ind.includes("food") || ind.includes("beverage")) return "Use broad food brand cues such as warmth, craft, cafe feeling, handmade quality, appetite, freshness, or friendly hospitality.";
  if (ind.includes("beauty") || ind.includes("skincare"))             return "Use broad beauty brand cues such as botanical refinement, soft natural forms, gentle elegance, skincare ritual, or premium lifestyle.";
  if (ind.includes("health") || ind.includes("wellness"))             return "Use broad wellness cues such as natural flow, calm balance, organic growth, gentle strength, or serene lifestyle.";
  if (ind.includes("fitness") || ind.includes("sport"))               return "Use broad fitness cues such as energy, motion, strength, bold form, athletic character, or dynamic lifestyle.";
  if (ind.includes("fashion") || ind.includes("apparel"))             return "Use broad fashion brand cues such as editorial refinement, minimal tension, quiet luxury, or premium lifestyle.";
  if (ind.includes("creative") || ind.includes("studio"))             return "Use broad creative brand cues such as bold concept, editorial character, geometric confidence, or distinctive visual identity.";
  if (ind.includes("finance") || ind.includes("fintech"))             return "Use broad finance brand cues such as stability, trust, precision, clean geometry, or professional authority.";
  if (ind.includes("legal") || ind.includes("consulting"))            return "Use broad professional cues such as balance, authority, clean structure, measured form, or credible presence.";
  if (ind.includes("education"))                                       return "Use broad education cues such as open path, spark, learning, forward momentum, or encouraging clarity.";
  if (ind.includes("real_estate") || ind.includes("real estate"))     return "Use broad real estate cues such as architectural form, refined elevation, premium space, or aspirational living.";
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

function buildMinimalConceptPrompt(input, conceptKey) {
  const brandName     = String(input?.brandName || "Brand").trim();
  const industry      = String(input?.industry  || "").replace(/_/g, " ").trim();
  const keywords      = [
    String(input?.keywords  || ""),
    String(input?.styleCues || ""),
  ].filter(Boolean).join(", ").trim();
  const notes         = String(input?.otherNotes || input?.notes || "").trim();
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

  const CONCEPT_ANGLES = {
    recommended: "Explore the strongest complete logo direction.",
    wordmark:    "Focus on a creative wordmark or lettering-led logo.",
    app_icon:    "Explore a compact icon or avatar-style mark that can work at small sizes.",
    symbol_mark: "Explore a memorable symbol mark or emblem for the brand.",
  };

  const parts = [];
  const industryPhrase = industry ? `a ${industry} brand` : "a brand";
  parts.push(`Create a creative commercial logo for ${brandName}, ${industryPhrase}.`);

  const userDirection = [keywords, notes].filter(Boolean).join(". ");
  if (userDirection)  parts.push(`User direction: ${userDirection}.`);
  if (styles)         parts.push(`Style: ${styles}.`);
  if (colorDir)       parts.push(`Color direction: ${colorDir}.`);
  const paletteCue = buildPaletteVariationCue(input);
  if (paletteCue)     parts.push(paletteCue);
  if (typographyDir)  parts.push(`Typography: ${typographyDir}.`);
  if (iconDir)        parts.push(`Icon direction: ${iconDir}.`);
  if (detail)         parts.push(`Detail level: ${detail}.`);

  const conceptAngle = CONCEPT_ANGLES[conceptKey] || "";
  if (conceptAngle)   parts.push(conceptAngle);

  const industryCue = buildMinimalIndustryCue(input);
  if (industryCue)    parts.push(industryCue);

  parts.push("Make it feel polished, memorable, and suitable for real brand use.");

  return parts.join(" ");
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
    // Minimal prompt + Magic Prompt AUTO experiment.
    // To revert: restore the three parts below and change magicPromptOverride back to "OFF".
    //   input.conceptPrompts[conceptKey].trim(),
    //   buildConceptBriefPrompt(input, conceptKey),
    //   CONCEPT_PROMPTS_SUFFIX,
    const parts = [
      buildMinimalConceptPrompt(input, conceptKey),
      MINIMAL_CONCEPT_SUFFIX,
    ];

    return {
      prompt: parts.join(" "),
      style_name: "logofunny",
      conceptLabel: conceptKey,
      magicPromptOverride: "AUTO",
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
