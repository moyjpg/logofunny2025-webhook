const nodeFetch = require("node-fetch");
const sharp = require("sharp");
const { uploadBufferToR2 } = require("./r2Upload");

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const SCENE_TEMPLATES = {
  editorial_launch: [
    "an editorial brand-launch still life with a large flat poster, a simple card, restrained props, soft directional studio light, and an intentionally composed grid",
    "The supplied logo is the hero: place it large and fully visible on one front-facing poster or card. Use smaller exact repeats only on other flat front-facing surfaces.",
  ],
  digital_campaign: [
    "a polished digital campaign workspace with a front-facing desktop display, a phone social-profile panel, brand stationery, and a clean art-directed tabletop",
    "The supplied logo is the hero: keep it fully visible and unmodified on a large flat display area, with a smaller exact repeat on the phone profile.",
  ],
  brand_system: [
    "a premium flat-lay brand system with a poster, a business card, a social profile card, and a simple packaging card arranged in a deliberate editorial composition",
    "The supplied logo is the hero: place it at a generous readable size on the poster and preserve it exactly on the supporting flat materials.",
  ],
  pet_brand_launch: [
    "a premium direct-to-consumer pet-care product launch in a warm, sunlit home: an upright resealable food bag, a matching snack pouch or treat box, a front-facing matte ceramic food bowl with visible kibble, a rope toy or ball, and a collar or leash. Include a laptop showing a believable ecommerce storefront and a phone showing a believable social profile. The lineup must immediately read as a modern pet-supplies brand even if no animal is present. Compose an abundant but tidy product story, not an office desk, care-guide card, or generic stationery flat lay.",
    "Use the identical supplied logo as one coherent identity across the scene: make it large and fully visible as a direct print on the smooth front of the food bag; repeat it smaller as direct print on the treat package and the front-facing bowl; use the same mark in the website header and as the circular social-profile avatar. Every placement must be fully visible, upright, and complete. The logo has transparent surroundings: print it directly on each surface with no white rectangle, white sticker, opaque tile, or mismatched background behind it. Keep printed placements front-facing and avoid folds, extreme curves, and perspective distortion.",
  ],
  food_beverage_launch: [
    "a premium food-and-drink brand launch with a cup, takeaway box or wrapper, menu card, shelf-ready product packaging, a small ordering page on a laptop, and a social-profile phone screen. Use an appetizing retail or cafe context with a strong product hierarchy rather than generic office stationery.",
    "Use the identical supplied logo as a direct, fully visible print on the primary package and cup, with smaller consistent repeats on the menu, ordering-site header, and social avatar. No white logo tiles or fake replacement marks; use the logo colours as the visual system.",
  ],
  beauty_wellness_launch: [
    "a refined beauty or wellness launch with a hero bottle or jar, secondary carton, pouch, retail shelf card, ecommerce detail page, and creator-style social profile. The scene should feel tactile, premium, and product-led rather than like a flat wireframe.",
    "Use the identical supplied logo directly on the front-facing bottle or carton, with coordinated smaller repeats on secondary packaging, ecommerce header, and social avatar. Never surround the logo with a white tile or invent a substitute brand mark.",
  ],
  apparel_retail_launch: [
    "a fashion or lifestyle retail identity across a folded garment or cap, woven hang tag, shopping bag, shipping insert, storefront or collection page, and social profile. Use believable materials and a fashion-editorial arrangement.",
    "Use the identical supplied logo as direct embroidery or print only on a smooth front-facing garment area, hang tag, bag, collection-page header, and social avatar. Keep it upright, complete, and free of white-background rectangles.",
  ],
  saas_tech_launch: [
    "a digital-first SaaS or technology launch with a polished desktop product page, mobile app or social profile, app-icon treatment, onboarding card, and subtle branded physical touchpoints. Make the central story recognisably digital, not a fake consumer-package scene.",
    "Use the identical supplied logo in the product header, app icon, social avatar, and any supporting flat print. Preserve consistent colour, scale, and spacing; no white logo stickers, fake alternate marks, or unreadable brand-name substitutions.",
  ],
  wedding_event_launch: [
    "an elevated wedding or event identity with invitation suite, RSVP card, menu or table card, welcome sign, event webpage, and social announcement. Use warm editorial styling and materials that feel specific to an occasion.",
    "Use the identical supplied logo or monogram directly and consistently across the invitation, sign, RSVP card, webpage header, and social avatar. Keep every placement complete and free of opaque white logo tiles.",
  ],
  home_retail_launch: [
    "a considered home-goods or retail collection launch with a product label, carton or sleeve, care card, shelf display, collection page, and social profile. Make the objects and styling reflect a real retail category, not generic stationery.",
    "Use the identical supplied logo as direct print on the label and carton, with smaller repeats on the care card, collection-page header, and social avatar. No white background box behind the logo and no replacement identity.",
  ],
  local_service_launch: [
    "a credible local-service identity with a storefront or vehicle-signage detail, appointment card, staff badge or uniform detail, booking webpage, map or directory-style mobile profile, and a small leave-behind print piece. The scene must look service-led rather than product-packaging-led.",
    "Use the identical supplied logo directly on the most visible sign or uniform area, then consistently in the booking-site header, mobile profile avatar, and appointment card. Keep it upright and unobstructed with no white logo tile or alternate mark.",
  ],
};

function normalizeR2BaseUrl() {
  return String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function assertTrustedLogoUrl(logoUrl) {
  const source = new URL(String(logoUrl || ""));
  const r2Base = normalizeR2BaseUrl();
  if (!r2Base || !source.href.startsWith(`${r2Base}/`)) {
    throw new Error("logoUrl must be an existing LogoFunny R2 image URL.");
  }
  return source.href;
}

function isBorderConnectedLightPixel(data, offset, channels) {
  const alpha = channels === 4 ? data[offset + 3] : 255;
  if (alpha < 12) return true;

  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const brightness = (red + green + blue) / 3;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return brightness >= 230 && chroma <= 28;
}

// The logo files produced by image models often contain an opaque off-white canvas.
// Remove only light pixels connected to the image edge so white details inside the mark
// survive. The derived PNG exists only in memory for the scene-edit request.
async function createTransparentSceneLogo(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const enqueueIfLight = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * channels;
    if (!isBorderConnectedLightPixel(data, offset, channels)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfLight(x, 0);
    enqueueIfLight(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueIfLight(0, y);
    enqueueIfLight(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueueIfLight(x - 1, y);
    enqueueIfLight(x + 1, y);
    enqueueIfLight(x, y - 1);
    enqueueIfLight(x, y + 1);
  }

  for (let index = 0; index < totalPixels; index += 1) {
    if (visited[index]) data[index * channels + 3] = 0;
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function getLogoBlob(logoUrl) {
  const sourceUrl = assertTrustedLogoUrl(logoUrl);
  const response = await nodeFetch(sourceUrl, { timeout: 20000 });
  if (!response.ok) {
    throw new Error(`Could not fetch source logo (${response.status}).`);
  }

  const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Source logo must be a PNG, JPEG, or WebP image.");
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_SOURCE_BYTES) {
    throw new Error("Source logo image exceeds the 10MB internal test limit.");
  }

  const buffer = await response.buffer();
  if (buffer.length > MAX_SOURCE_BYTES) {
    throw new Error("Source logo image exceeds the 10MB internal test limit.");
  }

  const transparentPng = await createTransparentSceneLogo(buffer);
  return { blob: new Blob([transparentPng], { type: "image/png" }), contentType: "image/png" };
}

function buildBrandScenePrompt({ brandName, template }) {
  const direction = SCENE_TEMPLATES[template];
  if (!direction) {
    throw new Error(`Unsupported scene template: ${template}`);
  }

  return [
    `Create one 3:2 horizontal brand-application scene for the brand "${brandName}".`,
    ...direction,
    "The supplied source image is an exact, transparent-background logo asset. Do not redraw, crop, rotate, distort, recolor, stylize, or replace it. Preserve the logo itself precisely while placing it as a direct print or digital identity element.",
    "Do not invent a replacement logo, alternate mark, or readable brand name. Never put the logo on a folded, highly angled, heavily textured, or physically warped surface. Do not add a white rectangle, white sticker, opaque tile, or mismatched background behind the logo unless the requested object is explicitly a white printed card.",
    "Supporting copy must be abstract editorial texture only, not legible words or claims. The finished image should feel intentional, warm, premium, and commercially plausible rather than like an unfinished wireframe.",
    "No watermarks, UI chrome, labels, pricing, testimonials, or text overlays outside the designed scene.",
  ].join(" ");
}

async function generateOpenAIBrandScene({
  brandName,
  logoUrl,
  template = "editorial_launch",
  storagePrefix = "brand-scenes-test",
}) {
  if (process.env.LOGOFUNNY_OPENAI_IMAGE_ENABLED !== "true") {
    throw new Error("OpenAI image generation is disabled.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in env.");
  }

  if (typeof globalThis.fetch !== "function" || typeof globalThis.FormData !== "function" || typeof globalThis.Blob !== "function") {
    throw new Error("This runtime must support native fetch, FormData, and Blob for GPT Image editing.");
  }

  const { blob } = await getLogoBlob(logoUrl);
  const form = new FormData();
  form.set("model", process.env.LOGOFUNNY_BRAND_SCENE_MODEL || "gpt-image-1.5");
  form.set("prompt", buildBrandScenePrompt({ brandName, template }));
  form.set("size", "1536x1024");
  form.set("quality", process.env.LOGOFUNNY_BRAND_SCENE_QUALITY || "medium");
  form.set("input_fidelity", "high");
  form.set("image[]", blob, "source-logo.png");

  const response = await globalThis.fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI brand scene API error ${response.status}: ${detail || "no details"}`);
  }

  const payload = await response.json();
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI returned no image data for the brand scene.");
  }

  const buffer = Buffer.from(b64, "base64");
  const uploaded = await uploadBufferToR2(buffer, "image/png", { prefix: storagePrefix });
  return {
    imageUrl: uploaded.publicUrl,
    r2Key: uploaded.key,
    template,
    model: process.env.LOGOFUNNY_BRAND_SCENE_MODEL || "gpt-image-1.5",
  };
}

module.exports = { generateOpenAIBrandScene, SCENE_TEMPLATES, createTransparentSceneLogo };
