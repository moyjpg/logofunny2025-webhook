// src/prompt-engine/index.js
import { normalize } from "./normalize.js";
import { validateInput } from "./schema.js";
import { decideRoute } from "./router.js";
import { NEGATIVE } from "./negative.js";
import { colorPacks } from "./packs/colorPacks.js";
import { fontPacks } from "./packs/fontPacks.js";
import { stylePacks } from "./packs/stylePacks.js";
import { buildText2ImgPrompt } from "./templates/text2img.js";
import { buildImg2ImgPrompt } from "./templates/img2img_controlnet.js";

export function buildPromptBundle(raw) {
  const check = validateInput(raw);
  if (!check.ok) {
    const err = new Error(check.errors.join("; "));
    err.status = 400;
    throw err;
  }

  const input = normalize(raw);
  const { route, reason } = decideRoute(input);

  // pack 选择策略：先用默认风格包，未来你可以让前端加一个“风格选择”
  const styleHint = [stylePacks.minimal_modern, stylePacks.geometric].join(", ");

  const color = colorPacks[input.colorTheme] || colorPacks.classic_black_white;
  const brandFontHint = fontPacks[input.brandFontStyle] || fontPacks.sans;
  const taglineFontHint = fontPacks[input.taglineFontStyle] || fontPacks.sans;

  const packs = {
    styleHint,
    colorHint: color.promptHint,
    brandFontHint,
    taglineFontHint
  };

  const prompt =
    route === "IMG2IMG_CONTROLNET"
      ? buildImg2ImgPrompt(input, packs)
      : buildText2ImgPrompt(input, packs);

  return {
    route,
    prompt,
    negativePrompt: NEGATIVE,
    metadata: {
      stylePacks: ["minimal_modern", "geometric"],
      colors: color.palette,
      fontHints: { brand: input.brandFontStyle, tagline: input.taglineFontStyle },
      debug: { reason, colorTheme: input.colorTheme }
    }
  };
}