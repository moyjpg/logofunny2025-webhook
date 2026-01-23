const { generateLogoMock, buildPromptFromBody } = require("./logoGenerateMock");
const { uploadLogoImageToR2 } = require("./r2Upload");
const { scoreImageUrl } = require("./designScore");

const STYLE_VARIANTS = [
  "bold geometric mark, strong silhouette",
  "monoline minimal icon, thin strokes",
  "rounded friendly shapes, soft corners",
  "sharp angular forms, tech-forward",
  "luxury premium feel, elegant spacing",
  "playful modern icon, simple shapes",
  "abstract emblem, balanced symmetry",
  "clean wordmark emphasis, minimal icon",
  "negative space concept, clever cutouts",
  "flat vector, ultra-minimal",
];

function buildPromptVariants(basePrompt, count) {
  const variants = [];
  for (let i = 0; i < count; i += 1) {
    const style = STYLE_VARIANTS[i % STYLE_VARIANTS.length];
    variants.push(`${basePrompt}, style: ${style}`);
  }
  return variants;
}

async function generateCandidate(mapped, prompt, index) {
  const result = await generateLogoMock({ ...mapped, promptOverride: prompt });
  const imageUrl = result?.imageUrl || null;

  let score = null;
  if (imageUrl) {
    score = await scoreImageUrl(imageUrl);
  }

  let finalImageUrl = imageUrl;
  let r2Key = null;
  if (imageUrl) {
    try {
      const uploaded = await uploadLogoImageToR2(imageUrl);
      finalImageUrl = uploaded.publicUrl;
      r2Key = uploaded.key;
    } catch (uploadErr) {
      console.error("[pipeline] R2 upload failed:", uploadErr);
    }
  }

  return {
    candidateId: index + 1,
    promptUsed: prompt,
    imageUrl: finalImageUrl,
    r2Key,
    score,
    model: result?.model || "mock",
    mode: result?.mode || "text2img",
  };
}

async function runLogoPipeline(mapped, options = {}) {
  const count = Math.max(1, Math.min(10, options.count || 5));
  const topN = Math.max(1, Math.min(3, options.topN || 3));

  const seedPrompt = mapped?.promptOverride || buildPromptFromBody(mapped);
  const promptVariants = buildPromptVariants(seedPrompt, count);

  const candidates = await Promise.all(
    promptVariants.map((p, i) => generateCandidate(mapped, p, i))
  );

  const ranked = [...candidates].sort((a, b) => {
    const sa = a.score?.score ?? -1;
    const sb = b.score?.score ?? -1;
    return sb - sa;
  });

  return {
    candidates,
    top: ranked.slice(0, topN),
  };
}

module.exports = {
  runLogoPipeline,
};
