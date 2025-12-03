// server.js – BlueJeans AI Design Engine (PRO MODE)

const express = require("express");
const cors = require("cors");

// Node 18+ global fetch var, ama garanti olsun diye:
const fetchFn = global.fetch || require("node-fetch");

// ---- CONFIG ----
const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini Node SDK (bunu package.json’da dependency olarak ekleyeceğiz)
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ENV kontrolü
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set! Check Render environment/secret.");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Şimdilik gemini-1.5-pro kullanıyoruz (multimodal)
// İleride Google’ın “image-only” modeli çıkarsa burayı değiştiririz.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// -----------------------------------------
//  Yardımcı: wix:image://v1/...  → https://static.wixstatic.com/media/...
// -----------------------------------------
function wixImageToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== "string") return null;
  if (!wixUrl.startsWith("wix:image://")) return wixUrl; // zaten http(s) ise aynen kullan

  // Örnek:
  // wix:image://v1/2e3f8a_edf394df10ed48cd9e77420bb7f920c7~mv2.jpg/blue-jeans-1_lot-2490.jpg#originWidth=2228...
  let s = wixUrl.replace("wix:image://v1/", "");

  // # sonrası parametreleri at
  const hashIndex = s.indexOf("#");
  if (hashIndex !== -1) s = s.slice(0, hashIndex);

  // ilk /’dan sonrasını at (dosya adı kısmı)
  const slashIndex = s.indexOf("/");
  if (slashIndex !== -1) s = s.slice(0, slashIndex);

  // Şimdi elimizde: 2e3f8a_edf394df10ed48cd9e77420bb7f920c7~mv2.jpg
  const httpsUrl = `https://static.wixstatic.com/media/${s}`;
  return httpsUrl;
}

// -----------------------------------------
//  Yardımcı: bir görseli indir → base64 yap
// -----------------------------------------
async function downloadImageAsBase64(url) {
  console.log("🔍 Downloading slab image from:", url);
  const resp = await fetchFn(url);
  if (!resp.ok) {
    throw new Error(`Image download failed: ${resp.status} ${resp.statusText}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  return base64;
}

// -----------------------------------------
//  Root endpoint – sağlık kontrolü
// -----------------------------------------
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine is running 🧠🟦 (PRO MODE)");
});

// -----------------------------------------
//  ANA ENDPOINT: /api/design
// -----------------------------------------
app.post("/api/design", async (req, res) => {
  try {
    const { prompt, slabImageUrl, slabLabel } = req.body || {};

    console.log("📩 /api/design called with:", {
      prompt,
      slabImageUrl,
      slabLabel,
    });

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "PROMPT_MISSING",
        message: "Prompt is required.",
      });
    }

    if (!slabImageUrl) {
      return res.status(400).json({
        ok: false,
        error: "SLAB_IMAGE_MISSING",
        message: "Slab image URL is required.",
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY_MISSING",
        message: "Backend is not configured with GEMINI_API_KEY.",
      });
    }

    // 1) Wix URL’ini gerçek HTTPS URL’e çevir
    const httpsUrl = wixImageToHttps(slabImageUrl);
    if (!httpsUrl) {
      throw new Error("Could not convert Wix image URL to HTTPS static URL.");
    }

    // 2) Slab görselini indir ve base64’e çevir
    const slabBase64 = await downloadImageAsBase64(httpsUrl);

    // 3) Gemini’ye istek için prompt metnini hazırlayalım
    const systemPrompt = `
You are an expert architectural visualizer and interior designer.
You receive a reference marble slab image and a user prompt describing a scene.

Your task:
- Use the reference marble texture as the main material in the scene.
- Keep the natural pattern, colors and character of the slab as much as possible.
- Produce a photorealistic, high-end render suitable for luxury architecture portfolios.

Material info:
- Name: Blue Jeans Marble (dolomitic, exotic, quarry-origin).
- Slab label: ${slabLabel || "unknown"}.

Now create a single, final image for this request:
"${prompt}"
    `.trim();

    console.log("🧠 Sending request to Gemini...");

    // 4) Gemini’ye gönder: text + inline image
    const geminiResult = await model.generateContent([
      {
        text: systemPrompt,
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: slabBase64, // referans slab görseli
        },
      },
    ]);

    const response = geminiResult.response;
    console.log("✅ Gemini response received.");

    // 5) Dönen response içinden inlineData (çıktı görseli) bul
    let outImageBase64 = null;
    let mimeType = "image/jpeg";

    if (response && Array.isArray(response.candidates)) {
      for (const cand of response.candidates) {
        if (!cand.content || !Array.isArray(cand.content.parts)) continue;
        for (const part of cand.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            outImageBase64 = part.inlineData.data;
            if (part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            break;
          }
        }
        if (outImageBase64) break;
      }
    }

    // Güvenlik: eğer Gemini beklediğimiz formatta dönmezse fallback
    if (!outImageBase64) {
      console.warn("⚠️ Gemini did not return inline image data, falling back to original slab.");
      return res.json({
        ok: true,
        mode: "FALLBACK_ORIGINAL_SLAB",
        message: "Gemini did not return image data; returning original slab.",
        imageBase64: slabBase64,
        mimeType: "image/jpeg",
        sourceImageUrl: httpsUrl,
      });
    }

    // 6) Frontend’e base64 görseli gönder
    return res.json({
      ok: true,
      mode: "GEMINI",
      message: "AI render generated successfully.",
      imageBase64: outImageBase64,
      mimeType,
    });
  } catch (err) {
    console.error("❌ /api/design error:", err);

    // Hata durumunda frontende düzgün JSON dön
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: err.message || "Unknown error",
    });
  }
});

// -----------------------------------------
// Server start
// -----------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 BlueJeans AI Design Engine listening on port ${PORT}`);
});
