// routes/debugRoutes.js
const express = require("express");
const router = express.Router();

const { buildPrompts } = require("../utils/promptEngine");

router.get("/prompt-test", (req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

module.exports = router;