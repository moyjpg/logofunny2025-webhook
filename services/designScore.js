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

function computeEdgeStats(gray, width, height) {
  const get = (x, y) => gray[y * width + x];
  let sumMag = 0;
  let count = 0;
  let strongEdges = 0;
  let centerSum = 0;
  let centerCount = 0;

  const edgeThreshold = 32;
  const cx0 = Math.floor(width * 0.2);
  const cx1 = Math.ceil(width * 0.8);
  const cy0 = Math.floor(height * 0.2);
  const cy1 = Math.ceil(height * 0.8);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx =
        -get(x - 1, y - 1) + get(x + 1, y - 1) +
        -2 * get(x - 1, y) + 2 * get(x + 1, y) +
        -get(x - 1, y + 1) + get(x + 1, y + 1);
      const gy =
        -get(x - 1, y - 1) - 2 * get(x, y - 1) - get(x + 1, y - 1) +
        get(x - 1, y + 1) + 2 * get(x, y + 1) + get(x + 1, y + 1);

      const mag = Math.sqrt(gx * gx + gy * gy);
      sumMag += mag;
      count += 1;
      if (mag > edgeThreshold) strongEdges += 1;

      if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) {
        centerSum += mag;
        centerCount += 1;
      }
    }
  }

  const meanEdge = count > 0 ? sumMag / count : 0;
  const edgeDensity = count > 0 ? strongEdges / count : 0;
  const centerEdge = centerCount > 0 ? centerSum / centerCount : 0;

  return { meanEdge, edgeDensity, centerEdge };
}

function computeReadabilityProxy(meanEdge, edgeDensity, centerEdge, contrast) {
  const clarity = clamp01(meanEdge / 120);
  const density = clamp01(1 - Math.abs(edgeDensity - 0.12) / 0.12);
  const centerBoost = clamp01(centerEdge / 140);
  const contrastBoost = clamp01(contrast / 128);
  return clamp01(clarity * 0.35 + density * 0.35 + centerBoost * 0.2 + contrastBoost * 0.1);
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
  const base = scorePixels(data, channels);

  const gray = await sharp(buffer)
    .resize(64, 64, { fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer();

  const edgeStats = computeEdgeStats(gray, info.width, info.height);
  const readabilityProxy = computeReadabilityProxy(
    edgeStats.meanEdge,
    edgeStats.edgeDensity,
    edgeStats.centerEdge,
    base.metrics.contrast
  );

  const clarityScore = clamp01(edgeStats.meanEdge / 120);
  const edgeDensityScore = clamp01(1 - Math.abs(edgeStats.edgeDensity - 0.12) / 0.12);
  const readabilityScore = readabilityProxy;

  const combined = clamp01(
    base.score / 100 * 0.55 +
      clarityScore * 0.2 +
      edgeDensityScore * 0.15 +
      readabilityScore * 0.1
  );

  return {
    score: Math.round(combined * 100),
    metrics: {
      ...base.metrics,
      edgeStrength: Number(edgeStats.meanEdge.toFixed(2)),
      edgeDensity: Number(edgeStats.edgeDensity.toFixed(4)),
      centerEdgeStrength: Number(edgeStats.centerEdge.toFixed(2)),
      clarityScore: Number(clarityScore.toFixed(3)),
      edgeDensityScore: Number(edgeDensityScore.toFixed(3)),
      readabilityScore: Number(readabilityScore.toFixed(3)),
    },
  };
}

module.exports = {
  scoreImageUrl,
};
