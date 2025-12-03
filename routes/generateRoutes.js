const express = require("express");
const router = express.Router();

const generateController = require("../services/generateController");

router.post("/generate", generateController.handleGenerate);

module.exports = router;