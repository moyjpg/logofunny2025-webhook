// config/env.js

require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,

  // HuggingFace
  HF_API_TOKEN: process.env.HF_API_TOKEN,
  HF_MODEL_ID: process.env.HF_MODEL_ID,

  // Replicate (leave empty for now)
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || null
};