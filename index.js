// index.js
const path = require("path");
const express = require("express");        // 1
const cors = require("cors");              // 2
require("dotenv").config();                // 3

const { buildPrompts } = require("./utils/promptEngine"); // 4

const debugRoutes = require("./routes/debugRoutes");      // 7
const aiRoutes = require("./routes/aiRoutes");            // 8
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态站点（前端页面）
app.use(express.static(path.join(__dirname, "public")));

// Debug + AI API
app.use("/debug", debugRoutes);
app.use("/api", aiRoutes);
app.get('/', (req, res) => {
  res.send('logofunny backend online');
});
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    timestamp: Date.now()
  });
});
app.get("/debug", (req, res) => {
  res.json({ ok: true, where: "index.js debug root" });
});
const logoRoutes = require('./routes/logoRoutes');

// Enable /generate route via dedicated router
const generateRoutes = require('./routes/generateRoutes');
const logoApiRoutes = require('./routes/logoApiRoutes');
app.use('/', logoApiRoutes);        // 里面有 /generate-logo
app.use('/internal', generateRoutes); // 现在 generateRoutes 变 internal
app.use('/internal', logoRoutes);     // 也变 internal

// Helpful GET handler to guide usage of /generate
app.get('/generate', (req, res) => {
  res.status(405).json({
    success: false,
    message: 'Use POST /generate with JSON body',
    example: {
      brandName: 'Acme',
      tagline: 'We build things',
      keywords: 'modern, minimal',
      colorTheme: 'blue',
      styleFont: 'Sans',
      taglineFont: 'Serif',
      notes: 'clean logo',
      industry: 'tech',
      uploadImage: null
    }
  });
});


app.listen(port, () => {
  console.log(`logofunny backend running on port ${port}`);
});
