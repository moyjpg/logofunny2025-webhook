const nodeFetch = require("node-fetch");
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

  return { blob: new Blob([buffer], { type: contentType }), contentType };
}

function buildBrandScenePrompt({ brandName, template }) {
  const direction = SCENE_TEMPLATES[template];
  if (!direction) {
    throw new Error(`Unsupported scene template: ${template}`);
  }

  return [
    `Create one 3:2 horizontal brand-application scene for the brand "${brandName}".`,
    ...direction,
    "Use the supplied source image as the exact logo asset. Do not redraw, crop, rotate, distort, recolor, stylize, or replace it.",
    "Never place the supplied logo on an angled, curved, folded, textured, or physically warped surface. Do not invent a replacement logo, alternate mark, or readable brand name.",
    "Supporting copy must be abstract editorial texture only, not legible words or claims. The finished image should feel intentional, warm, premium, and commercially plausible rather than like an unfinished wireframe.",
    "No watermarks, UI chrome, labels, pricing, testimonials, or text overlays outside the designed scene.",
  ].join(" ");
}

async function generateOpenAIBrandScene({ brandName, logoUrl, template = "editorial_launch" }) {
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
  const uploaded = await uploadBufferToR2(buffer, "image/png", { prefix: "brand-scenes-test" });
  return {
    imageUrl: uploaded.publicUrl,
    template,
    model: process.env.LOGOFUNNY_BRAND_SCENE_MODEL || "gpt-image-1.5",
  };
}

module.exports = { generateOpenAIBrandScene, SCENE_TEMPLATES };
