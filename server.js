// server.js
// BlueJeans AI Design Engine – Nano Banana Pro (Gemini 3 Pro Image)

// ----------------------
// 1) IMPORTLAR
// ----------------------
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ----------------------
// 2) ENV KONTROLLERİ
// ----------------------
const PORT = process.env.PORT || 8080;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY ortam değişkeni tanımlı değil. " +
      "Lütfen Render Dashboard → Environment → GEMINI_API_KEY ekle."
  );
  process.exit(1);
}

// 🔑 Google Gemini / Nano Banana client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Nano Banana Pro model adı
// (gerekirse burada güncelleriz; şimdilik blog’da geçen preview adı)
const MODEL_NAME = "gemini-3-pro-image-preview";

// ----------------------
// 3) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Basit health-check
app.get("/", (req, res) => {
  res.send("BlueJeans Nano Banana Pro Engine is running 🧠🍌");
});

// ----------------------
// 4) Wix URL → gerçek HTTPS URL (YENİ SÜRÜM – 403 FIX)
// ----------------------
function wixToHttps(wixUrl) {
  if (!wixUrl.startsWith("wix:image://")) return wixUrl;

  // Örn:
  // wix:image://v1/2e3f8a_edf394df10ed48cd9e77420bb7f920c7~mv2.jpg/blue-jeans-1_-lot-2490.jpg#originWidth=2228&originHeight=1350

  // 1) "wix:image://v1/" kısmını temizle
  const clean = wixUrl.replace("wix:image://v1/", "");

  // 2) İlk parça ID, ikinci parça gerçek dosya adı
  const parts = clean.split("/");
  const id = parts[0]; // 2e3f8a_edf39.....~mv2.jpg
  const filenameWithHash = parts[1] || "";
  const filename = filenameWithHash.split("#")[0]; // blue-jeans-1_-lot-2490.jpg

  // Sadece ID varsa (eski format), en azından bu URL çalışır
  if (!filename) {
    const url = `https://static.wixstatic.com/media/${id}`;
    console.log("[wixToHttps] old-style URL →", url);
    return url;
  }

  // Yeni doğru format:
  const url = `https://static.wixstatic.com/media/${id}/${filename}`;
  console.log("[wixToHttps] wix:image →", url);
  return url;
}

// ----------------------
// 5) Slab resmini indir → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);

  const resp = await fetch(url);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(
      `❌ Slab image download failed: ${resp.status} ${resp.statusText}`,
      text ? `\nResponse body: ${text}` : ""
    );
    throw new Error(
      `Slab image download failed: ${resp.status} ${resp.statusText}`
    );
  }

  const arrayBuf = await resp.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString("base64");
  const mimeType = resp.headers.get("content-type") || "image/jpeg";

  return { base64, mimeType };
}

// ----------------------
// 6) Nano Banana Pro ile IMAGE + TEXT → IMAGE
// ----------------------
async function generateWithNanoBananaPro({ prompt, slabBase64, slabMime }) {
  console.log("[NanoBananaPro] Prompt:", prompt);

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  // Gemini image generation: image + text birlikte parts içinde gönderilir
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          slabBase64 && slabMime
            ? {
                inlineData: {
                  mimeType: slabMime,
                  data: slabBase64,
                },
              }
            : null,
        ].filter(Boolean),
      },
    ],
  });

  const candidate = result?.response?.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    console.error("[NanoBananaPro] Empty response:", result);
    throw new Error("Nano Banana Pro boş response döndürdü.");
  }

  // parts içinde inlineData olan kısmı bul
  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error("[NanoBananaPro] No inlineData in parts:", candidate.content);
    throw new Error("Nano Banana Pro cevabında görsel inlineData bulunamadı.");
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return { imageBase64, mimeType };
}

// ----------------------
// 7) ANA ENDPOINT: /api/design
// ----------------------
app.post("/api/design", async (req, res) => {
  const { prompt, slabImageUrl, slabLabel } = req.body || {};

  console.log("📥 [/api/design] Body:", { prompt, slabImageUrl, slabLabel });

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({
      ok: false,
      error: "Prompt boş olamaz.",
    });
  }

  if (!slabImageUrl) {
    return res.status(400).json({
      ok: false,
      error: "slabImageUrl eksik. Lütfen önce bir slab seç.",
    });
  }

  try {
    // 1) Wix URL → static HTTPS
    const httpsUrl = wixToHttps(slabImageUrl);

    // 2) Slab'i indir → base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) Blue Jeans Marble vurgusunu prompt'a zenginleştir
    const enrichedPrompt = (slabLabel
      ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
      : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
    ).trim();

    // 4) Nano Banana Pro ile image+text → image
    const { imageBase64, mimeType } = await generateWithNanoBananaPro({
      prompt: enrichedPrompt,
      slabBase64,
      slabMime,
    });

    return res.json({
      ok: true,
      imageBase64,
      mimeType,
      model: MODEL_NAME,
      received: {
        prompt,
        slabImageUrl,
        slabLabel,
      },
    });
  } catch (err) {
    console.error("🔥 [/api/design] ERROR:", err);

    return res.status(500).json({
      ok: false,
      error:
        err.message ||
        "Nano Banana Pro isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 8) SERVER’I BAŞLAT
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Nano Banana Pro Engine listening on port ${PORT}`
  );
});
