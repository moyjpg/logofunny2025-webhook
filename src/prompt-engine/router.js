// src/prompt-engine/router.js
export function decideRoute(input) {
  if (input.hasImage) return { route: "IMG2IMG_CONTROLNET", reason: "hasImage=true" };
  return { route: "TEXT2IMG", reason: "no reference image" };
}