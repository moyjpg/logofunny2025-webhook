// src/prompt-engine/schema.js
export function validateInput(raw) {
  const errors = [];

  // brandName 可空？你之前的产品逻辑是允许上传logo为空，但品牌名通常别空
  if (!raw.brandName || String(raw.brandName).trim().length < 1) {
    errors.push("brandName is required");
  }

  // keywords 可空，但建议至少给1个
  // 这里不强行卡死，留给 normalize 自动补默认值
  return { ok: errors.length === 0, errors };
}