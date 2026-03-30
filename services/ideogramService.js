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

  // 1) Core structure (LogoFunny constitution: logo must look like a real logo)
  let structureTag = "one standalone abstract geometric brand mark and one readable wordmark";
  let layoutTag = "centered or horizontal logo lockup";
  let toneTag = "minimal, clean, geometric, professional, scalable, favicon recognizable, flat vector style";
  let typographyTag = "clean modern sans-serif, highly legible";
  let colorTag = "";
  let brandMoodTag = "";
  let notesTag = "";

  // 2) Industry mapping (short, tag-like, no long explanations)
  if (industry.includes("tech") || industry.includes("technology") || industry.includes("software") || industry.includes("saas")) {
    toneTag = "minimal, clean, geometric, software-first, calm, professional, scalable, favicon recognizable, flat vector style";
  } else if (industry.includes("finance") || industry.includes("legal")) {
    toneTag = "minimal, structured, trustworthy, serious, professional, scalable, favicon recognizable, flat vector style";
  } else if (industry.includes("beauty") || industry.includes("fashion") || industry.includes("jewelry") || industry.includes("luxury")) {
    toneTag = "minimal, refined, elegant, premium, professional, scalable, favicon recognizable, flat vector style";
  } else if (industry.includes("fitness") || industry.includes("sport")) {
    toneTag = "minimal, bold, geometric, energetic, professional, scalable, favicon recognizable, flat vector style";
  } else if (industry.includes("real estate") || industry.includes("architecture")) {
    toneTag = "minimal, structured, stable, architectural, professional, scalable, favicon recognizable, flat vector style";
  } else if (industry.includes("food") || industry.includes("coffee") || industry.includes("restaurant")) {
    toneTag = "minimal, warm, approachable, clean, professional, scalable, favicon recognizable, flat vector style";
  }

  // 3) Optional structure mapping by brand name length or style hints
  if (brandName.length <= 3) {
    structureTag = "one clean geometric monogram mark and one readable wordmark";
  }

  if (brandFontStyle) {
    typographyTag = `clean ${brandFontStyle} typography, highly legible`;
  }

  if (colorTheme) {
    colorTag = `Color palette: ${colorTheme}.`;
  }

  if (keywords) {
    brandMoodTag = `Brand mood references: ${keywords}.`;
  }

  if (otherNotes) {
    notesTag = `Art direction notes: ${otherNotes}.`;
  }

  // 4) Short constitution-style exclusions
  // Keep this short. Ideogram handles positive structure better than long negative lists.
  const exclusionTag =
    "No people, no scenes, no mascots, no extra decorative symbols.";

  return [
    `Commercial logo for "${brandName}".`,
    `${structureTag}.`,
    `${layoutTag}.`,
    `${toneTag}.`,
    `Typography: ${typographyTag}.`,
    colorTag,
    brandMoodTag,
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

