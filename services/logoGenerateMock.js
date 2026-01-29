// services/logoGenerateMock.js

const fetch = require('node-fetch');
const Replicate = require("replicate");

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ====== Color Theme Normalizer (EN only, safe) ======
function normalizeColorTheme(input) {
  if (!input) return "";

  // ✅ Elementor checkbox → array
  if (Array.isArray(input)) {
    const joined = input.join(" ");
    return normalizeColorTheme(joined);
  }

  // ✅ 确保是字符串
  if (typeof input !== "string") {
    input = String(input);
  }

  const txt = input.toLowerCase().trim();

  const map = {
    blue: "blue",
    navy: "navy",
    sky: "sky blue",
    black: "black",
    white: "white",
    gold: "gold",
    silver: "silver",
    red: "red",
    green: "green",
    yellow: "yellow",
    purple: "purple",
    orange: "orange",
    pink: "pink",
  };

  // single color
  if (map[txt]) return map[txt];

  // multi-color cases: "blue and white", "black & gold"
  const parts = txt
    .split(/,|&|and/)
    .map((s) => s.trim())
    .filter(Boolean);

  const normalized = parts.map((p) => map[p] || p);

  return normalized.join(" and ");
}
// ====== Prompt builder (with industry support) ======
function buildPromptFromBody(body) {
  const {
    brandName,
    brandTagline,
    keywords,
    colorTheme,
    brandFontStyle,
    taglineFontStyle,
    otherNotes,
    industry
  } = body || {};

  const baseParts = [];

  // 1) Core identity
  if (brandName) {
    baseParts.push(`a professional brand logo for "${brandName}"`);
  } else {
    baseParts.push("a professional minimalist brand logo");
  }

  if (brandTagline) {
    baseParts.push(`subtle concept inspired by tagline: ${brandTagline}`);
  }

  // 2) Industry → design direction
  if (industry) {
    baseParts.push(`for a business in the ${industry} industry`);
    const industryLower = industry.toLowerCase();

    if (industryLower.includes("tech") || industryLower.includes("technology")) {
      baseParts.push("modern, geometric, clean, innovative look");
    } else if (industryLower.includes("food") || industryLower.includes("beverage") || industryLower.includes("coffee")) {
      baseParts.push("warm, inviting, slightly vintage cafe-style look");
    } else if (industryLower.includes("beauty") || industryLower.includes("fashion")) {
      baseParts.push("elegant, refined, soft curves, premium aesthetic");
    } else if (industryLower.includes("fitness")) {
      baseParts.push("bold, strong shapes, dynamic and energetic feel");
    } else if (industryLower.includes("real estate")) {
      baseParts.push("trustworthy, stable, structured, architectural feel");
    } else if (industryLower.includes("kids") || industryLower.includes("toys")) {
      baseParts.push("playful, friendly, simple shapes, high readability");
    } else if (industryLower.includes("pets")) {
      baseParts.push("friendly, caring, organic shapes, soft curves");
    } else if (industryLower.includes("finance")) {
      baseParts.push("trustworthy, minimal, serious, institutional feel");
    } else if (industryLower.includes("education")) {
      baseParts.push("inspiring, structured, approachable academic feel");
    }
  }

  // 3) Visual concept
  if (keywords) {
    baseParts.push(`symbolic icon based on: ${keywords}`);
  }
  // Overall logo layout preference
  baseParts.push(
    "logo layout: clear central icon with brand name in clean typography, no slogan wall of text"
  );
  const cleanColor = normalizeColorTheme(colorTheme);
  if (cleanColor) {
  baseParts.push(`color palette: ${cleanColor}`);
  }

  // 4) Typography direction (even if logo may end up without text)
  const fontHints = [];
  if (brandFontStyle) fontHints.push(`brand font style: ${brandFontStyle}`);
  if (taglineFontStyle) fontHints.push(`tagline font style: ${taglineFontStyle}`);
  if (fontHints.length > 0) {
    baseParts.push(fontHints.join(", "));
  }

  // 5) Extra user notes
  if (otherNotes) {
    baseParts.push(`art direction notes: ${otherNotes}`);
  }

  // 6) Logo-specific style constraints + layout
  baseParts.push(
  // 核心：要的是“商标级别”的简洁 logo，而不是插画
  "minimalist flat vector logo, clean geometric shapes, strong silhouette, high contrast",
  "no photo, no 3d render, no realistic lighting, no complex illustration",

  // 版式倾向：像真实 logo 的构图
  "single clear icon with simple negative space, balanced composition",
  "brand name and optional tagline placed clearly next to or below the icon",

  // 可注册、可印刷
  "suitable for professional brand trademark, scalable, works well in black and white",
  "no detailed background scene, no busy composition, no tiny unreadable elements"
  );

  return baseParts.join(", ");
}

// ====== HuggingFace text-to-image call (SDXL) ======
const HF_API_TOKEN = process.env.HF_API_TOKEN;
const HF_MODEL_ID = process.env.HF_MODEL_ID || "stabilityai/stable-diffusion-xl-base-1.0";

async function callHuggingFaceTextToImage(prompt) {
  if (!HF_API_TOKEN) {
    throw new Error("HF_API_TOKEN is not set");
  }

  console.log("[HF] Calling SDXL model:", HF_MODEL_ID);

  const url = `https://router.huggingface.co/hf-inference/models/${HF_MODEL_ID}`;

  const payload = {
  inputs: prompt,
  parameters: {
    // 提示跟随程度：8–9 对 logo 比较合适（更听话）
    guidance_scale: 8.5,

    // 明确禁止各种“插画 / 写实 / 场景”
    negative_prompt: [
      "photo, photography, photorealistic, 3d render, realistic lighting",
      "complex background, detailed scene, landscape, environment",
      "busy composition, clutter, too many small details",
      "low contrast, blurry, low quality, distorted text, bad typography",
      "watermark, signature, logo of other brands, stock photo"
    ].join(", "),

    // 尺寸：1:1 正方形 → 方便后面缩放
    width: 1024,
    height: 1024,

    // 步数 35：比 30 稍微细一点，又不会太慢
    num_inference_steps: 35
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "image/png"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF API error ${res.status}: ${text}`);
  }

  // HuggingFace 返回图片二进制（buffer）
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:image/png;base64,${base64}`;

  return {
    imageUrl: dataUrl,
    model: HF_MODEL_ID,
    mode: "text-only"
  };
}

// ====== Logo generator (Replicate first, HF fallback, then dummy) ======
function isProviderEnabled(name) {
  const envKey = `USE_${name.toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw == null) return true;
  return String(raw).toLowerCase() !== "false";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("429") || msg.toLowerCase().includes("too many requests");
}

function formatReplicateError(err) {
  const status = err?.response?.status || err?.status || "";
  const data = err?.response?.data || err?.data || "";
  const msg = err?.message || String(err);
  return `${msg}${status ? ` (status ${status})` : ""}${data ? ` ${JSON.stringify(data)}` : ""}`;
}

function getReplicateModel() {
  // Default to Recraft SVG for more logo-like vector results.
  // You can override via REPLICATE_MODEL (e.g. stability-ai/sdxl).
  return process.env.REPLICATE_MODEL || "recraft-ai/recraft-v3-svg";
}

async function replicateTextToImage(prompt) {
  const maxRetries = Number.parseInt(process.env.REPLICATE_MAX_RETRIES, 10);
  const baseDelay = Number.parseInt(process.env.REPLICATE_RETRY_BASE_MS, 10);
  const retries = Number.isFinite(maxRetries) ? maxRetries : 2;
  const delayBase = Number.isFinite(baseDelay) ? baseDelay : 1200;
  const model = getReplicateModel();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // Recraft SVG expects prompt + size (+ optional style)
      if (String(model).includes("recraft-ai/recraft-v3-svg")) {
        const output = await replicate.run(model, {
          input: {
            prompt,
            size: process.env.RECRAFT_SIZE || "1024x1024",
            // Keep style wide-open for now; we can tighten later once we see results.
            style: process.env.RECRAFT_STYLE || "any",
          },
        });
        return output;
      }

      // SDXL-style models fallback
      const output = await replicate.run(model, {
        input: {
          prompt,
          negative_prompt:
            "people, person, human, character, mascot, animal, cartoon, illustration, scene, background elements, hands, tools, ladders, workers, builders, sticker, clipart, sketch, outline drawing, photo, 3d, render, realistic lighting, clutter",
          guidance_scale: 7,
          width: 1024,
          height: 1024,
          num_inference_steps: 35,
        },
      });
      return output;
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= retries) {
        throw err;
      }
      const delay = delayBase * Math.pow(2, attempt);
      console.warn(`[Replicate] 429 retry in ${delay}ms`);
      await sleep(delay);
    }
  }
  return null;
}

async function generateLogoMock(body) {
  const uploadImage = body?.uploadImage || body?.upload_image || null;
  const prompt = body?.promptOverride || buildPromptFromBody(body);

  try {
  // ===============================
  // 优先：有图 → Replicate 图生图
  // ===============================
  if (uploadImage) {
    console.log("[Replicate] image-to-image");

    const output = await replicate.run(
      "stability-ai/sdxl-controlnet",
      {
        input: {
          image: uploadImage,
          prompt,
          guidance_scale: 7,
        },
      }
    );

    return {
      imageUrl: Array.isArray(output) ? output[0] : output,
      prompt,
      model: "replicate-sdxl-controlnet",
      mode: "image-to-image",
    };
  }

  // ===============================
  // 没图：优先 Replicate（可开关），HF 作为备选（可开关）
  // ===============================
  if (isProviderEnabled("ideogram")) {
    console.warn("[Ideogram] enabled but not implemented yet");
  }

  const replicateEnabled = isProviderEnabled("replicate");
  const hfEnabled = isProviderEnabled("hf");

  let replicateError = null;
  if (replicateEnabled) {
    try {
      console.log(`[Replicate] text-to-image model=${getReplicateModel()}`);
      const output = await replicateTextToImage(prompt);

      return {
        imageUrl: Array.isArray(output) ? output[0] : output,
        prompt,
        model: String(getReplicateModel()).includes("recraft-ai/recraft-v3-svg") ? "replicate-recraft-v3-svg" : "replicate-sdxl",
        mode: "text-to-image",
      };
    } catch (replicateErr) {
      replicateError = replicateErr;
      console.error("[Replicate] text-to-image failed, fallback to HF:", formatReplicateError(replicateErr));
    }
  }

  if (hfEnabled) {
    console.log("[HF] text-to-image");
    const hf = await callHuggingFaceTextToImage(prompt);

    return {
      imageUrl: hf.imageUrl,
      prompt,
      model: hf.model,
      mode: "text-to-image",
    };
  }

  if (replicateEnabled && !hfEnabled) {
    throw new Error(
      `Replicate failed and HF disabled (USE_REPLICATE=${process.env.USE_REPLICATE}, USE_HF=${process.env.USE_HF}): ${formatReplicateError(replicateError)}`
    );
  }

  throw new Error(
    `No text-to-image providers enabled (USE_REPLICATE=${process.env.USE_REPLICATE}, USE_HF=${process.env.USE_HF})`
  );

} catch (err) {
    console.error("[AI] generate failed, fallback dummy:", err);

    return {
      imageUrl: "https://dummyimage.com/1024x1024/eeeeee/000000.png&text=Mock+Logo",
      prompt,
      model: "mock-fallback",
      mode: "fallback",
    };
  }
}

module.exports = {
  buildPromptFromBody,
  generateLogoMock
};
