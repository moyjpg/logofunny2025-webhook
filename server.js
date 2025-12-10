import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import PDFDocument from 'pdfkit'
import archiver from 'archiver'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import fetch from 'node-fetch'
import FormData from 'form-data'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
// ====== Prompt builder ======
function buildPromptFromBody(body) {
  const {
    brandName,
    brandTagline,
    keywords,
    colorTheme,
    brandFontStyle,
    taglineFontStyle,
    otherNotes
  } = body || {};

  let parts = [];

  if (brandName) parts.push(`Brand name: ${brandName}`);
  if (brandTagline) parts.push(`Tagline: ${brandTagline}`);
  if (keywords) parts.push(`Keywords: ${keywords}`);
  if (colorTheme) parts.push(`Color theme: ${colorTheme}`);
  if (brandFontStyle) parts.push(`Brand font style: ${brandFontStyle}`);
  if (taglineFontStyle) parts.push(`Tagline font style: ${taglineFontStyle}`);
  if (otherNotes) parts.push(`Notes: ${otherNotes}`);

  if (parts.length === 0) {
    return 'Minimal clean logo';
  }

  return parts.join(' | ');
}

// ====== Mock logo generator ======
async function mockGenerateLogo(body) {
  const prompt = buildPromptFromBody(body);

  return {
    imageUrl: 'https://dummyimage.com/1024x1024/eeeeee/000000.png&text=Mock+Logo',
    prompt,
    model: 'mock-local',
    mode: 'text-only'
  };
}
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});
app.post("/ping", (req, res) => {
  res.json({ message: "pong", body: req.body });
});
// ====== Core generate-logo endpoint (mock) ======
app.post('/generate-logo', async (req, res) => {
  try {
    const body = req.body || {};
    const { brandName, keywords } = body;

    // basic validation
    if (!brandName && !keywords) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: at least brandName or keywords is required.'
      });
    }

    console.log('[/generate-logo] incoming body:', body);

    // use mock generator for now
    const result = await mockGenerateLogo(body);

    return res.status(200).json({
      ok: true,
      source: 'mock-generate-logo',
      data: result
    });
  } catch (err) {
    console.error('[/generate-logo] error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error in /generate-logo'
    });
  }
});
const i18n = {
  en: {
    title: 'AI Brand Visual Generator',
    navHome: 'Logo Maker',
    navApps: 'Applications',
    navGallery: 'Gallery',
    navBlog: 'Blog',
    login: 'Login',
    logout: 'Logout',
    upgrade: 'Upgrade',
    planFree: 'Free Plan',
    planPro: 'Pro Member',
    formTitle: 'Brand Inputs',
    brandName: 'Brand Name',
    tagline: 'Tagline',
    keywords: '3-5 Keywords',
    mainColor: 'Primary Color (Hex)',
    fontPref: 'Font Preference',
    modern: 'Modern',
    classic: 'Classic',
    handwritten: 'Handwritten',
    uploadLogo: 'Upload Existing Logo',
    uploadRefs: 'Upload Reference Images',
    submit: 'Generate',
    langSwitch: '中文',
    results: 'Generated Results',
    downloadZip: 'Download Brand Assets (ZIP)',
    pdfGuide: 'Download Style Guide (PDF)',
    share: 'Share',
    regenerate: 'Regenerate'
  },
  zh: {
    title: 'AI 品牌视觉生成',
    navHome: '首页生成',
    navApps: '应用设计',
    navGallery: '作品集合',
    navBlog: '博客',
    login: '登录',
    logout: '退出',
    upgrade: '升级会员',
    planFree: '免费版',
    planPro: '会员版',
    formTitle: '品牌输入',
    brandName: '品牌名称',
    tagline: '副标题/标语',
    keywords: '3-5 个关键词',
    mainColor: '主色调（Hex）',
    fontPref: '字体偏好',
    modern: '现代',
    classic: '传统',
    handwritten: '手写',
    uploadLogo: '上传现有 Logo',
    uploadRefs: '上传风格参考图',
    submit: '生成',
    langSwitch: 'EN',
    results: '生成结果',
    downloadZip: '下载品牌资产（ZIP）',
    pdfGuide: '下载风格指南（PDF）',
    share: '分享',
    regenerate: '重新生成'
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'))
  }
})
const upload = multer({ storage })

app.get('/', (req, res) => {
  const lang = req.query.lang === 'zh' ? 'zh' : 'en'
  const plan = req.cookies.plan || 'free'
  const user = req.cookies.user || null
  res.render('index', { t: i18n[lang], lang, plan, user })
})

app.get('/set-plan', (req, res) => {
  const plan = req.query.plan === 'pro' ? 'pro' : 'free'
  const user = req.cookies.user || null
  if (!user && plan === 'pro') {
    return res.redirect('/login')
  }
  res.cookie('plan', plan, { httpOnly: false })
  res.redirect(req.headers.referer || '/')
})

app.get('/login', (req, res) => {
  const lang = req.query.lang === 'zh' ? 'zh' : 'en'
  const plan = req.cookies.plan || 'free'
  res.render('login', { t: i18n[lang], lang, plan })
})

app.post('/login', (req, res) => {
  const { email } = req.body
  const userId = (email || '').toLowerCase().trim()
  if (!userId) return res.redirect('/login')
  res.cookie('user', userId, { httpOnly: false })
  res.redirect('/')
})

app.post('/logout', (req, res) => {
  res.clearCookie('user')
  res.clearCookie('plan')
  res.redirect('/')
})

function sanitize(str) {
  return String(str || '').replace(/[<>]/g, '')
}

function buildPalette(primaryHex) {
  const p = primaryHex?.startsWith('#') ? primaryHex : '#' + (primaryHex || '000000')
  // simple palette: primary, darken, lighten, accent1, accent2
  const toRgb = (hex) => {
    const h = hex.replace('#', '')
    const bigint = parseInt(h, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
  }
  const rgb = toRgb(p)
  const clamp = (n) => Math.max(0, Math.min(255, n))
  const hex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
  const dark = hex(clamp(rgb.r - 40), clamp(rgb.g - 40), clamp(rgb.b - 40))
  const light = hex(clamp(rgb.r + 40), clamp(rgb.g + 40), clamp(rgb.b + 40))
  const accent1 = hex(clamp(rgb.b), clamp(rgb.r), clamp(rgb.g))
  const accent2 = hex(clamp(rgb.g), clamp(rgb.b), clamp(rgb.r))
  return [p, dark, light, accent1, accent2]
}

function svgLogo({ brand, tagline, color, fontPref, styleIndex }) {
  const palette = buildPalette(color)
  const bg = '#ffffff'
  const primary = palette[0]
  const accent = palette[3]
  const shape = styleIndex % 3
  const font = fontPref === 'handwritten' ? '"Brush Script MT", cursive' : fontPref === 'classic' ? '"Times New Roman", serif' : 'Inter, Arial, sans-serif'
  const width = 1600, height = 800
  const shapes = [
    `<circle cx="120" cy="120" r="80" fill="${primary}" />`,
    `<rect x="40" y="40" width="160" height="160" rx="24" fill="${primary}" />`,
    `<polygon points="120,20 200,180 40,180" fill="${primary}" />`
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${accent}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="${bg}" />
  <g transform="translate(120, 160)">
    ${shapes[shape]}
  </g>
  <text x="320" y="200" font-family="${font}" font-size="120" font-weight="700" fill="url(#g1)">${brand}</text>
  <text x="320" y="280" font-family="${font}" font-size="44" fill="${palette[1]}">${tagline}</text>
  <g transform="translate(320, 340)">
    ${palette.map((c, i) => `<rect x="${i * 110}" y="0" width="100" height="60" fill="${c}" />`).join('')}
  </g>
</svg>`
}

async function svgToPngBuffers(svg, sizes) {
  const out = {}
  for (const s of sizes) {
    out[s] = await sharp(Buffer.from(svg)).resize({ width: s }).png({ compressionLevel: 9 }).toBuffer()
  }
  return out
}

function writeFileSyncSafe(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, data)
}

app.post('/generate', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'refs', maxCount: 6 }]), async (req, res) => {
  const lang = req.query.lang === 'zh' ? 'zh' : 'en'
  const t = i18n[lang]
  const plan = req.cookies.plan || 'free'
  const { brandName, tagline, keywords, mainColor, fontPref } = req.body
  const quality = req.body.exportQuality === 'print' ? 'print' : 'web'
  const brand = sanitize(brandName)
  const tag = sanitize(tagline)
  const color = sanitize(mainColor || '#3b82f6')
  const font = ['modern', 'classic', 'handwritten'].includes(fontPref) ? fontPref : 'modern'

  const sessionId = uuidv4()
  const baseDir = path.join(__dirname, 'outputs', sessionId)
  fs.mkdirSync(baseDir, { recursive: true })

  const stylesCount = 6
  const svgs = []
  for (let i = 0; i < stylesCount; i++) {
    const svg = svgLogo({ brand, tagline: tag, color, fontPref: font, styleIndex: i })
    const svgPath = path.join(baseDir, `logo_${i + 1}.svg`)
    writeFileSyncSafe(svgPath, svg)
    svgs.push({ svg, svgPath })
  }

  const sizes = quality==='print' ? [1024, 2048, 4096] : [256, 512, 1024]
  const pngPaths = []
  for (let i = 0; i < svgs.length; i++) {
    const buffers = await svgToPngBuffers(svgs[i].svg, sizes)
    for (const s of sizes) {
      const p = path.join(baseDir, `logo_${i + 1}_${s}.png`)
      writeFileSyncSafe(p, buffers[s])
      pngPaths.push(p)
    }
  }

  if (plan === 'pro') {
    const logoFile = req.files && req.files.logo && req.files.logo[0] ? req.files.logo[0].path : null
    const prompt = `${brand} ${tag} ${keywords || ''} ${font}`
    try {
      const aiBuffers = await callAI({ prompt, controlImagePath: logoFile })
      aiBuffers.forEach((buf, idx) => {
        const p = path.join(baseDir, `ai_logo_${idx + 1}_${quality==='print' ? 2048 : 1024}.png`)
        writeFileSyncSafe(p, buf)
        pngPaths.push(p)
      })
    } catch {}
  }

  const palette = buildPalette(color)
  writeFileSyncSafe(path.join(baseDir, 'palette.json'), JSON.stringify(palette, null, 2))

  const fontCombos = [
    { heading: 'Inter', body: 'Inter' },
    { heading: 'Playfair Display', body: 'Inter' },
    { heading: 'Montserrat', body: 'Lora' },
    { heading: 'Noto Sans SC', body: 'Noto Serif SC' }
  ]
  writeFileSyncSafe(path.join(baseDir, 'fonts.json'), JSON.stringify(fontCombos, null, 2))

  const pdfPath = path.join(baseDir, 'style-guide.pdf')
  const doc = new PDFDocument({ size: 'A4', margin: 36 })
  doc.pipe(fs.createWriteStream(pdfPath))
  doc.fontSize(24).text(`${brand} / ${tag}`, { align: 'left' })
  doc.moveDown()
  doc.fontSize(16).text('Palette: ' + palette.join(', '))
  doc.moveDown()
  for (let i = 0; i < Math.min(3, pngPaths.length); i++) {
    try { doc.image(pngPaths[i], { width: 300 }) } catch {}
  }
  doc.addPage()
  doc.fontSize(16).text('Font Combos')
  fontCombos.forEach(fc => doc.text(`${fc.heading} / ${fc.body}`))
  doc.end()

  const zipPath = path.join(baseDir, 'brand-assets.zip')
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(baseDir, false)
    archive.finalize()
  })

  const firstPng = pngPaths[0]
  const firstRel = path.relative(path.join(__dirname, 'public'), firstPng)
  const previewUrl = `/download/${sessionId}/` + path.basename(firstPng)

  res.render('result', {
    t,
    lang,
    plan,
    sessionId,
    brand,
    tag,
    color,
    palette,
    svgs: svgs.map((s, i) => ({ name: `Logo ${i + 1}`, url: `/download/${sessionId}/` + path.basename(s.svgPath), svg: true })),
    pngs: pngPaths.map(p => ({ name: path.basename(p), url: `/download/${sessionId}/` + path.basename(p) })),
    zipUrl: `/download/${sessionId}/` + path.basename(zipPath),
    pdfUrl: `/download/${sessionId}/` + path.basename(pdfPath),
    previewUrl
  })
  res.cookie('lastSessionId', sessionId, { httpOnly: false })
})

app.get('/download/:sid/:file', (req, res) => {
  const { sid, file } = req.params
  const fpath = path.join(__dirname, 'outputs', sid, file)
  if (!fs.existsSync(fpath)) return res.status(404).send('Not found')
  const ext = path.extname(fpath).toLowerCase()
  if (ext === '.png') res.type('image/png')
  else if (ext === '.svg') res.type('image/svg+xml')
  else if (ext === '.pdf') res.type('application/pdf')
  else if (ext === '.zip') res.type('application/zip')
  else res.type('application/octet-stream')
  res.sendFile(fpath)
})

app.get('/download-attachment/:sid/:file', (req, res) => {
  const { sid, file } = req.params
  const fpath = path.join(__dirname, 'outputs', sid, file)
  if (!fs.existsSync(fpath)) return res.status(404).send('Not found')
  res.download(fpath)
})

app.post('/checkout', async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return res.json({ ok: true, message: 'Checkout disabled (no STRIPE_SECRET_KEY set)' })
  }
  const stripe = (await import('stripe')).default(key)
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'alipay'],
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Brand Pack' }, unit_amount: 1900 }, quantity: 1 }],
    success_url: getBaseUrl(req) + '/?status=success',
    cancel_url: getBaseUrl(req) + '/?status=cancel'
  })
  res.json({ id: session.id, url: session.url })
})

app.get('/apps', (req, res) => {
  const lang = req.query.lang === 'zh' ? 'zh' : 'en'
  const t = i18n[lang]
  const plan = req.cookies.plan || 'free'
  const sid = req.cookies.lastSessionId
  let pngSampleUrl = null
  if (sid) {
    const dir = path.join(__dirname, 'outputs', sid)
    const sample = ['logo_1_512.png', 'logo_1_1024.png', 'logo_1_256.png'].find(f => fs.existsSync(path.join(dir, f)))
    if (sample) pngSampleUrl = `/download/${sid}/` + sample
  }
  res.render('apps', { t, lang, plan, pngSampleUrl })
})

app.get('/gallery', (req, res) => {
  const lang = req.query.lang === 'zh' ? 'zh' : 'en'
  const t = i18n[lang]
  const plan = req.cookies.plan || 'free'
  const base = path.join(__dirname, 'outputs')
  let items = []
  try {
    const dirs = fs.readdirSync(base)
    items = dirs.map(d => {
      const p = path.join(base, d)
      let mtime = 0
      try { mtime = fs.statSync(p).mtimeMs } catch {}
      const sample = ['logo_1_512.png', 'logo_1_1024.png', 'logo_1_256.png'].find(f => fs.existsSync(path.join(p, f)))
      return { sid: d, url: sample ? `/download/${d}/` + sample : null, mtime }
    }).filter(x => x.url).sort((a,b)=>b.mtime-a.mtime).slice(0,12)
  } catch {}
  res.render('gallery', { t, lang, plan, items })
})

app.get('/blog', (req, res) => {
  const lang = req.query.lang === 'zh' ? 'zh' : 'en'
  const t = i18n[lang]
  const plan = req.cookies.plan || 'free'
  const posts = [
    { title: lang==='zh'?'如何用AI打造一致性品牌':'How to Build Consistent Brands with AI', excerpt: lang==='zh'?'从色板到字体组合，全面解读':'From palettes to font pairs, a practical walkthrough' },
    { title: lang==='zh'?'Logo生成的设计准则':'Design Principles for Logo Generation', excerpt: lang==='zh'?'几何形与留白的平衡':'Balancing geometry and whitespace' },
    { title: lang==='zh'?'品牌应用模板的最佳实践':'Best Practices for Brand Applications', excerpt: lang==='zh'?'名片、信纸与社交模板':'Cards, stationery and social templates' }
  ]
  res.render('blog', { t, lang, plan, posts })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT)
})
function getBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_BASE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers.host || 'localhost:3000'
  return `${proto}://${host}`
}

async function callAI({ prompt, controlImagePath }) {
  const base = process.env.AI_API_BASE
  const key = process.env.AI_API_KEY
  if (!base) return []
  const url = base.replace(/\/$/, '') + '/generate'
  const fd = new FormData()
  fd.append('prompt', prompt)
  if (controlImagePath && fs.existsSync(controlImagePath)) {
    fd.append('control', fs.createReadStream(controlImagePath))
  }
  const resp = await fetch(url, { method: 'POST', headers: { Authorization: key ? `Bearer ${key}` : undefined }, body: fd })
  if (!resp.ok) return []
  const data = await resp.json()
  const images = Array.isArray(data.images) ? data.images : []
  const bufs = []
  for (const im of images.slice(0, 6)) {
    try {
      if (typeof im === 'string' && /^data:image\/.+;base64,/.test(im)) {
        const b64 = im.split(',')[1]
        bufs.push(Buffer.from(b64, 'base64'))
      }
    } catch {}
  }
  return bufs
}
