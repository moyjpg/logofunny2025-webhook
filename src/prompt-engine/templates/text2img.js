// src/prompt-engine/templates/text2img.js
export function buildText2ImgPrompt(input, packs) {
  const { brandName, tagline,hti= tagline } = input;
  const { styleHint, colorHint, brandFontHint, taglineFontHint } = packs;

  const taglineLine = tagline ? `Tagline: "${tagline}".` : "";

  return [
    `Design a professional vector logo for the brand "${brandName}".`,
    taglineLine,
    `Keywords: ${input.keywords.join(", ")}.`,
    `Typography: brand text in ${brandFontHint}; tagline in ${taglineFontHint}.`,
    `Color direction: ${colorHint}.`,
    `Style: ${styleHint}.`,
    `Clean background, scalable, high legibility, balanced spacing.`,
    input.notes ? `Additional notes: ${input.notes}.` : ""
  ].filter(Boolean).join(" ");
}