// src/prompt-engine/templates/img2img_controlnet.js
export function buildImg2ImgPrompt(input, packs) {
  const { brandName, tagline } = input;
  const { styleHint, colorHint, brandFontHint, taglineFontHint } = packs;

  const taglineLine = tagline ? `Include tagline "${tagline}" below or beside the brand name.` : "";

  return [
    `Use the provided reference image as structural inspiration (keep core silhouette/geometry).`,
    `Create a refined vector logo for "${brandName}".`,
    taglineLine,
    `Maintain recognizability while upgrading to a polished brand mark.`,
    `Typography: ${brandFontHint}; tagline: ${taglineFontHint}.`,
    `Color direction: ${colorHint}.`,
    `Style: ${styleHint}.`,
    `Minimal background, crisp edges, avoid extra elements.`,
    input.notes ? `Notes: ${input.notes}.` : ""
  ].filter(Boolean).join(" ");
}