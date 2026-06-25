const fetch = require("node-fetch");
const { uploadBufferToR2 } = require("./r2Upload");
const {
  planConceptDirections,
  buildMinimalIndustryCue,
  buildPaletteVariationCue,
  detectPetAnimal,
} = require("./ideogramService");

function getConceptTerritory(industryRaw, conceptKey, brandName) {
  // Deterministic offset so same brand always gets the same territory slot.
  const offset = brandName.split("").reduce((n, c) => n + c.charCodeAt(0), 0);

  const isTech    = /tech|saas|ai|software|app|data|cloud|platform|startup|dev|digital|cyber|robot|ml|analytics|api/.test(industryRaw);
  const isPet     = /pet|animal|vet|dog|cat|bird/.test(industryRaw);
  const isFood    = /food|restaurant|cafe|coffee|bakery|kitchen|catering|meal/.test(industryRaw);
  const isHealth  = /health|wellness|medical|fitness|pharma|clinic|therapy|mental/.test(industryRaw);
  const isFinance = /finance|fintech|bank|invest|insurance|payment|wealth|crypto/.test(industryRaw);

  if (conceptKey === "wordmark") {
    if (isTech) {
      const picks = [
        `The wordmark's defining move: the first letter of "${brandName}" has its terminal removed and the stroke ends with a clean diagonal cut — an angled exit. The rest of the letters are set in matching weight with even spacing. The cut is the only custom element.`,
        `The wordmark turns "${brandName}" into a visual system: one letter has an open counter that creates a deliberate pocket of negative space, giving the name an architectural quality — built, not typed.`,
        `One letter in "${brandName}" has its crossbar extended past its natural boundary — the horizontal stroke runs longer on one side, adding deliberate asymmetry to an otherwise balanced wordmark. The extension is structural, not decorative.`,
        `The wordmark for "${brandName}" plays with rhythm: letter-spacing opens progressively from left to right, as if the word is expanding — a typographic metaphor for growth and forward motion.`,
      ];
      return picks[offset % picks.length];
    }
    if (isPet) {
      return `The wordmark for "${brandName}" has warmth in its letterforms — rounded terminals, generous spacing, and one character with a softened counter that makes the name feel approachable and alive.`;
    }
    if (isFood) {
      return `The wordmark for "${brandName}" has craft in its letterforms — one character has a slightly organic terminal, as if drawn by hand, while the rest maintains clean geometric structure.`;
    }
    if (isHealth) {
      return `The wordmark for "${brandName}" balances clinical precision with human warmth: clean geometric letterforms with one character modified to have a slightly open, inviting counter.`;
    }
    if (isFinance) {
      return `The wordmark for "${brandName}" conveys authority through typographic precision: strong verticals, deliberate spacing, and one character with a modified terminal that adds a mark of distinction.`;
    }
    return `The wordmark for "${brandName}" looks drawn rather than typed: one letter carries a deliberate modification — a terminal, counter, or extension — that gives the name a specific personality no off-the-shelf font could provide.`;
  }

  if (conceptKey === "app_icon") {
    if (isTech) {
      const picks = [
        `The mark is a portal or gateway — an arch or threshold form implying entry, access, and connection. Clean geometry, strong closed silhouette. Not a spark or node.`,
        `The mark is a workflow ribbon — a single unbroken stroke that loops back on itself, implying automation and continuous process. One closed geometric path, cleanly resolved.`,
        `The mark is folded geometry — one plane that folds at a precise angle, implying transformation and efficiency. Angular, architectural, with a strong silhouette at any size.`,
        `The mark is a cursor or window — a software-native metaphor: a clean rectangular frame, a pointer, or both in relationship. Direct, functional, specific to the software experience.`,
        `The mark is a motion trail — one geometric shape that implies velocity: a clean leading edge and a clear sense of direction. The mark looks like it arrived from somewhere.`,
      ];
      return picks[offset % picks.length];
    }
    if (isPet) {
      return `The mark is a single clean animal silhouette — bold enough to read at 32 pixels, simple enough to feel symbolic rather than illustrative. One form, strong outline, no internal detail.`;
    }
    if (isFood) {
      return `The mark is one bold food or utensil form — reduced to its strongest geometric silhouette, specific to this brand's concept, immediately legible at favicon size.`;
    }
    if (isHealth) {
      return `The mark is a single clean form suggesting wellness — a leaf, a continuous path, or a circle with a purposeful break — geometric and simple, readable at any size, free of medical clichés.`;
    }
    if (isFinance) {
      return `The mark is a single geometric form implying growth or direction — an upward angle, a contained shape, or a path that resolves to a point. Clean, authoritative, favicon-ready.`;
    }
    return `The mark is a single geometric form — reduced to its strongest silhouette, specific to the concept behind ${brandName}, immediately readable at 32 pixels. One idea, cleanly executed.`;
  }

  if (conceptKey === "symbol_mark") {
    if (isTech) {
      const picks = [
        `The mark begins as the first letter of "${brandName}" and ends differently — one stroke is extended past its natural endpoint, making the letterform complete itself in an unexpected direction. Read it as a letter; read it as a geometric idea. One form, two meanings.`,
        `The mark is a single parenthesis — one curved stroke, slightly open, implying containment. The brand name sits outside it. The form implies wrapping, like brackets around a concept, not an arrow going anywhere.`,
        `The mark is a Y drawn at a precise angle — the fork deliberate, the proportions architectural. Read it as a branch point, read it as a structural form. The ambiguity is the idea.`,
        `The mark has a dual reading: at first glance one geometric form; on closer inspection it contains a second idea. A shape that reveals itself to the viewer who looks twice.`,
        `The mark is three right-angle fragments arranged to imply a closed square that never closes — the fourth corner is missing, and the eye completes it. Precise, systematic, one deliberate absence.`,
      ];
      return picks[offset % picks.length];
    }
    if (isPet) {
      return `The mark is the most inventive animal symbol possible — not an illustration but a geometric abstraction that captures the animal's most memorable quality in the fewest possible strokes.`;
    }
    if (isFood) {
      return `The mark takes a food concept and resolves it into something unexpected — a geometric abstraction that implies flavor or craft without resorting to literal food shapes.`;
    }
    if (isHealth) {
      return `The mark is the most inventive health symbol possible — not a cross or leaf or person, but a geometric form that captures vitality or transformation in an unexpected shape owned entirely by this brand.`;
    }
    if (isFinance) {
      return `The mark is a geometric abstraction of financial momentum — not a chart or dollar sign, but a shape implying growth and direction in a form that could only belong to this brand.`;
    }
    return `The mark is the most inventive symbol possible for ${brandName} — a geometric idea that captures the brand's core concept in a form specific, memorable, and designed to belong to no other brand.`;
  }

  // recommended
  if (isTech) {
    const picks = [
      `The mark and wordmark share a visual idea: the symbol's geometric logic appears again in one modified letterform — a connection that makes the identity feel designed as a system, not assembled from parts.`,
      `The mark is one clean geometric concept specific to what ${brandName} does — not a generic tech icon, but an invented form. The wordmark beside it has precise, slightly open-spaced lettering.`,
    ];
    return picks[offset % picks.length];
  }
  if (isPet) {
    return `A warm, confident brand identity: a clean animal-inspired mark paired with a wordmark in rounded, approachable letterforms — both feel like they came from the same design thinking.`;
  }
  if (isFood) {
    return `A confident food brand identity: a craft-driven mark paired with a wordmark that feels considered. The overall composition has warmth and specificity — made, not generated.`;
  }
  if (isHealth) {
    return `A clear, trustworthy health brand identity: a clean symbolic mark paired with a confident wordmark. The composition balances precision with warmth.`;
  }
  if (isFinance) {
    return `An authoritative financial brand identity: a precise geometric mark paired with a strong, deliberate wordmark. The composition conveys stability and forward direction.`;
  }
  return `A complete brand identity where mark and wordmark share a visual logic — both feel designed from the same thinking, giving ${brandName} a cohesive, memorable identity that could belong to no other brand.`;
}

function buildOpenAILogoPrompt(input, conceptKey) {
  const brandName    = String(input?.brandName || "Brand").trim();
  const industryRaw  = String(input?.industry  || "").toLowerCase();
  const industry     = industryRaw.replace(/_/g, " ").trim();
  const keywords     = [
    String(input?.keywords  || ""),
    String(input?.styleCues || ""),
  ].filter(Boolean).join(", ").trim();
  const notes    = String(input?.otherNotes || input?.notes || "").trim();
  const colorDir = String(input?.colorDirection || "").replace(/_/g, " ").trim();

  const searchText   = [brandName, industryRaw, keywords, notes].join(" ").toLowerCase();
  const animalTarget = industryRaw.includes("pet") ? detectPetAnimal(searchText) : "none";

  const directions   = planConceptDirections(industryRaw, animalTarget, brandName, keywords);
  const conceptAngle = directions[conceptKey] || "";

  const industryCue  = buildMinimalIndustryCue(input);
  const paletteCue   = buildPaletteVariationCue(input);

  // Character-by-character spelling anchor — strongest known OpenAI text-accuracy technique.
  const nameChars = brandName.split("").join("-");

  const brandIntro   = `Create a professional commercial logo for ${brandName}${industry ? `, a ${industry} brand` : ""}.`;
  const nameAnchor   = `Brand name: "${brandName}". Spell it exactly, character by character: ${nameChars}. Do not add, remove, or change any letter or space.`;
  const SAFETY_BLOCK = "Output: one centered logo on a plain white (#FFFFFF) background. No ® ™ © symbols. No multi-panel. No brand board. No extra text beyond the brand name.";

  const territory = getConceptTerritory(industryRaw, conceptKey, brandName);

  const optional = [
    industryCue ? industryCue                     : null,
    colorDir    ? `Color direction: ${colorDir}.` : null,
    paletteCue  ? paletteCue                      : null,
    keywords    ? `Visual cues: ${keywords}.`     : null,
    notes       ? `User notes: ${notes}.`         : null,
  ].filter(Boolean);

  let parts;

  if (conceptKey === "wordmark") {
    parts = [
      brandIntro,
      territory,
      ...(conceptAngle ? [conceptAngle] : []),
      "Flat vector design, logo-ready.",
      ...optional,
      `${nameAnchor} Every letter correct. This is the entire logo — no symbol, no icon.`,
      SAFETY_BLOCK,
    ];
  } else if (conceptKey === "app_icon") {
    parts = [
      brandIntro,
      territory,
      ...(conceptAngle ? [conceptAngle] : []),
      "Flat vector design, logo-ready.",
      ...optional,
      nameAnchor,
      SAFETY_BLOCK,
      "The mark reads clearly at favicon size (32×32 pixels) and at full size equally well.",
    ];
  } else if (conceptKey === "symbol_mark") {
    parts = [
      brandIntro,
      territory,
      ...(conceptAngle ? [conceptAngle] : []),
      `Brand name "${brandName}" appears below the mark in restrained, minimal type — the mark carries the creative weight.`,
      "Flat vector design, logo-ready.",
      ...optional,
      nameAnchor,
      SAFETY_BLOCK,
    ];
  } else {
    // recommended — complete identity lockup
    parts = [
      brandIntro,
      territory,
      ...(conceptAngle ? [conceptAngle] : []),
      "Flat vector design, logo-ready.",
      ...optional,
      nameAnchor,
      SAFETY_BLOCK,
      "The result should look like a finished logo for a real brand — polished, memorable, and suitable for actual use.",
    ];
  }

  return parts.join(" ");
}

async function generateOpenAILogoConcept(input = {}, conceptKey = "app_icon") {
  if (process.env.LOGOFUNNY_OPENAI_IMAGE_ENABLED !== "true") {
    throw new Error("OpenAI image generation is disabled (set LOGOFUNNY_OPENAI_IMAGE_ENABLED=true to enable)");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in env");
  }

  const quality = process.env.LOGOFUNNY_OPENAI_IMAGE_QUALITY || "medium";
  const prompt  = buildOpenAILogoPrompt(input, conceptKey);

  if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
    console.log("[openai-image] conceptKey=%s quality=%s promptPreview=%j",
      conceptKey, quality, prompt.slice(0, 600));
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI image API error ${response.status}: ${detail || "no details"}`);
  }

  const data = await response.json();
  const b64  = data?.data?.[0]?.b64_json;
  if (!b64) {
    const availableKeys = JSON.stringify(Object.keys(data?.data?.[0] || {}));
    throw new Error(`OpenAI returned no b64_json image data. Available keys in data[0]: ${availableKeys}`);
  }

  const buffer = Buffer.from(b64, "base64");
  const { publicUrl } = await uploadBufferToR2(buffer, "image/png", { prefix: "logos" });

  return {
    imageUrl:     publicUrl,
    prompt,
    style_name:   "openai",
    conceptLabel: conceptKey,
    model:        "openai",
    mode:         "text-to-image",
  };
}

module.exports = {
  generateOpenAILogoConcept,
};
