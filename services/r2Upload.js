const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");

const REQUIRED_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
];

function assertR2Env() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing R2 env: ${missing.join(", ")}`);
  }
}

function getR2Client() {
  assertR2Env();
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function isDataUrl(value) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value || "");
}

function dataUrlToBuffer(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  return {
    buffer: Buffer.from(match[2], "base64"),
    contentType: match[1],
  };
}

function contentTypeToExt(contentType) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[contentType] || "png";
}

function buildPublicUrl(key) {
  const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${key}`;
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch image failed ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function uploadLogoImageToR2(imageUrl, opts = {}) {
  const client = getR2Client();
  const prefix = opts.prefix || "logos";

  const { buffer, contentType } = isDataUrl(imageUrl)
    ? dataUrlToBuffer(imageUrl)
    : await fetchImageBuffer(imageUrl);

  const ext = contentTypeToExt(contentType);
  const key = `${prefix}/${Date.now()}-${uuidv4()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return { key, publicUrl: buildPublicUrl(key) };
}

module.exports = {
  uploadLogoImageToR2,
};
