const fetch = require("node-fetch");
const sharp = require("sharp");

function isDataUrl(value) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value || "");
}

function dataUrlToBuffer(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  return Buffer.from(match[2], "base64");
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch image failed ${res.status}: ${text}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function scorePixels(data, channels) {
  const count = Math.floor(data.length / channels);
  let sum = 0;
  let sumSq = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSqR = 0;
  let sumSqG = 0;
  let sumSqB = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    sum += luminance;
    sumSq += luminance * luminance;

    sumR += r;
    sumG += g;
    sumB += b;
    sumSqR += r * r;
    sumSqG += g * g;
    sumSqB += b * b;
  }

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const contrast = Math.sqrt(variance); // 0-255

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const stdR = Math.sqrt(Math.max(0, sumSqR / count - meanR * meanR));
  const stdG = Math.sqrt(Math.max(0, sumSqG / count - meanG * meanG));
  const stdB = Math.sqrt(Math.max(0, sumSqB / count - meanB * meanB));
  const colorfulness = (stdR + stdG + stdB) / 3;

  const contrastScore = clamp01(contrast / 128);
  const colorScore = clamp01(colorfulness / 96);

  let brightnessPenalty = 0;
  if (mean < 40) brightnessPenalty = (40 - mean) / 80;
  if (mean > 220) brightnessPenalty = (mean - 220) / 80;
  brightnessPenalty = clamp01(brightnessPenalty);

  const score01 = clamp01(contrastScore * 0.6 + colorScore * 0.4 - brightnessPenalty * 0.3);

  return {
    score: Math.round(score01 * 100),
    metrics: {
      meanLuminance: Math.round(mean),
      contrast: Number(contrast.toFixed(2)),
      colorfulness: Number(colorfulness.toFixed(2)),
    },
  };
}

async function scoreImageUrl(imageUrl) {
  const buffer = isDataUrl(imageUrl)
    ? dataUrlToBuffer(imageUrl)
    : await fetchImageBuffer(imageUrl);

  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 3;
  return scorePixels(data, channels);
}

module.exports = {
  scoreImageUrl,
};
