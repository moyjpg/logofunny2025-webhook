const express = require("express");
const router = express.Router();

const generateController = require("../services/generateController");

router.post("/generate__controller", generateController.handleGenerate);

module.exports = router;