const generateService = require("./generateService");

exports.handleGenerate = async (req, res) => {
  try {
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
    } = req.body;

    const result = await generateService.process({
      brandName,
      tagline,
      keywords,
      colorTheme,
      styleFont,
      taglineFont,
      notes,
      industry,
      uploadImage,
    });

    return res.json({
      success: true,
      data: result,
      error: null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message,
    });
  }
};