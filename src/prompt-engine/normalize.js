// src/prompt-engine/normalize.js
import { uniq, clipLen, splitKeywords } from "./utils.js";

export function normalize(raw) {
  const brandName = clipLen(String(raw.brandName || "").trim(), 40);
  const tagline = clipLen(String(raw.tagline || "").trim(), 60);

  const keywords = uniq(
    splitKeywords(raw.keywords || "")
      .map(s => s.toLowerCase())
      .filter(Boolean)
  ).slice(0, 12);

  return {
    hasImage: Boolean(raw.logoImageUrl || raw.logoImageBase64),
    brandName,
    tagline,
    keywords: keywords.length ? keywords : ["modern", "clean", "logo"],
    colorTheme: raw.colorTheme || "classic_black_white",
    brandFontStyle: raw.brandFontStyle || "sans",
    taglineFontStyle: raw.taglineFontStyle || "sans",
    notes: clipLen(String(raw.notes || "").trim(), 200)
  };
}