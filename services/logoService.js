// services/logoService.js
// Logo generation service layer

const logger = require('../utils/logger');
const fetch = require('node-fetch');
const { HF_API_TOKEN, HF_MODEL_ID } = require('../config/env');

// Unified response helper
function buildResponse(success, data = null, error = null) {
  return { success, data, error };
}

// Build prompt for text-to-image model
function buildTextToImagePrompt(payload) {
  const {
    brandName,
    tagline,
    keywords,
    colorTheme,
    brandFontStyle,
    taglineFontStyle,
    notes,
    industry,
  } = payload;

  const parts = [];

  parts.push(
    `Logo for a ${industry || 'modern'} brand named "${brandName || 'Brand'}".`
  );

  if (tagline) {
    parts.push(`Tagline: "${tagline}".`);
  }

  if (keywords) {
    parts.push(`Style keywords: ${keywords}.`);
  }

  if (colorTheme) {
    parts.push(`Color theme: ${colorTheme}.`);
  }

  if (brandFontStyle || taglineFontStyle) {
    parts.push(
      `Font styles: brand ${brandFontStyle || 'clean sans-serif'}, tagline ${
        taglineFontStyle || 'light sans-serif'
      }.`
    );
  }

  if (notes) {
    parts.push(`Extra notes: ${notes}.`);
  }

  // Force logo-like output
  parts.push(
    'Flat vector logo, clean, minimal, high contrast, centered composition, no background, professional graphic design.'
  );

  return parts.join(' ');
}

// Call Hugging Face text-to-image API
async function callHuggingFaceTextToImage(prompt) {
  if (!HF_API_TOKEN) {
    throw new Error('HF_API_TOKEN is not set');
  }

  const modelId = HF_MODEL_ID || 'stabilityai/stable-diffusion-2';

  const response = await fetch(
  `https://router.huggingface.co/${modelId}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_API_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    body: JSON.stringify({
      inputs: prompt,
      options: { wait_for_model: true },
    }),
  }
);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HF API error ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64Image = Buffer.from(arrayBuffer).toString('base64');
  const dataUrl = `data:image/png;base64,${base64Image}`;

  return dataUrl;
}

// ---------------- Mock service kept for test endpoint ----------------

async function generateMockLogo(payload) {
  try {
    const received =
      typeof payload === 'object' && payload !== null ? payload : {};
    const previewUrl = 'https://example.com/mock-logo.png';

    const data = { previewUrl, received };
    return buildResponse(true, data, null);
  } catch (err) {
    logger.error(
      `Service error in generateMockLogo: ${
        err && err.message ? err.message : String(err)
      }`
    );
    return buildResponse(false, null, 'Failed to generate mock logo');
  }
}

// ---------------- With image: future Replicate + ControlNet ----------------

async function generateLogoWithImage(payload) {
  try {
    const {
      brandName,
      tagline,
      keywords,
      colorTheme,
      brandFontStyle,
      taglineFontStyle,
      notes,
      industry,
      logoUrl,
    } = payload;

    // TODO: later we will call Replicate + ControlNet here
    const previewUrl = 'https://example.com/mock-logo-with-image.png';

    const data = {
      previewUrl,
      meta: {
        brandName,
        tagline,
        keywords,
        colorTheme,
        brandFontStyle,
        taglineFontStyle,
        notes,
        industry,
        logoUrl,
      },
    };

    return buildResponse(true, data, null);
  } catch (err) {
    logger.error(
      `Service error in generateLogoWithImage: ${
        err && err.message ? err.message : String(err)
      }`
    );
    return buildResponse(false, null, 'Failed to generate logo with image');
  }
}

// ---------------- Text-only: real Hugging Face generation ----------------

async function generateLogoFromText(payload) {
  try {
    const {
      brandName,
      tagline,
      keywords,
      colorTheme,
      brandFontStyle,
      taglineFontStyle,
      notes,
      industry,
    } = payload;

    const prompt = buildTextToImagePrompt(payload);
    const previewUrl = await callHuggingFaceTextToImage(prompt);

    const data = {
      previewUrl,
      meta: {
        brandName,
        tagline,
        keywords,
        colorTheme,
        brandFontStyle,
        taglineFontStyle,
        notes,
        industry,
        prompt,
        modelId: HF_MODEL_ID,
      },
    };

    return buildResponse(true, data, null);
  } catch (err) {
    logger.error(
      `Service error in generateLogoFromText: ${
        err && err.message ? err.message : String(err)
      }`
    );
    return buildResponse(false, null, 'Failed to generate logo from text');
  }
}

module.exports = {
  generateMockLogo,
  generateLogoWithImage,
  generateLogoFromText,
};