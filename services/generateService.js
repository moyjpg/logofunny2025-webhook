const logger = require("../utils/logger");

/**
 * Main service for AI logo generation.
 * For now this is a MOCK service:
 * - If uploadImage exists → pretend to use Replicate + ControlNet
 * - If uploadImage is missing → pretend to use HuggingFace text-to-image
 * Later we can replace the mock parts with real model calls.
 */

async function process(payload) {
  const {
    brandName,
    tagline,
    keywords,
    colorTheme,
    styleFont,
    taglineFont,
    notes,
    industry,
    uploadImage,
  } = payload;

  // Basic validation
  if (!brandName) {
    throw new Error("brandName is required");
  }

  // Just some logging to keep track
  logger.info("generateService.process called", {
    hasUploadImage: !!uploadImage,
    brandName,
    industry,
  });

  // Decide which branch to use
  const usedEngine = uploadImage ? "replicate-mock" : "huggingface-mock";

  // Build a mock preview URL (for now this is just a placeholder)
  // Later we will replace this with the real image URL from the model.
  const previewUrl =
    "https://dummyimage.com/1024x1024/111111/ffffff&text=LogoFunny+Mock";

  // Echo back all inputs so the frontend can debug easily
  const received = {
    brandName,
    tagline,
    keywords,
    colorTheme,
    styleFont,
    taglineFont,
    notes,
    industry,
    hasUploadImage: !!uploadImage,
  };

  return {
    engine: usedEngine,
    previewUrl,
    received,
  };
}

module.exports = {
  process,
};