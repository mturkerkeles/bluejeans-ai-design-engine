// server.js
// BlueJeans AI Design Engine – Gemini 2.5 Flash Image
// TEXT + IMAGE → IMAGE (Blue Jeans Marble referanslı tasarım)

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
// 2) ENV / AYARLAR
// ----------------------
const PORT = process.env.PORT || 8080;

// Render’da Environment kısmında kullandığımız key:
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY ortam değişkeni tanımlı değil. " +
      "Lütfen Render Dashboard → Environment bölümünde GEMINI_API_KEY olarak ekleyin."
  );
  process.exit(1);
}

// 🔑 Google Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🔥 RESMİ MODEL ADI:
//   “Gemini 2.5 Flash Image”  →  "gemini-2.5-flash-image"
const MODEL_NAME = "gemini-2.5-flash-image";

// ----------------------
// 3) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Basit health-check
app.get("/", (req, res) => {
  res.send("BlueJeans Gemini 2.5 Flash Image Engine is running 🧠🟦");
});

// ----------------------
// 4) Wix URL → gerçek HTTPS URL (+ raw=1)
// ----------------------
function wixToHttps(wixUrl) {
  // Örn: wix:image://v1/xxxxx~mv2.jpg/blue-jeans-slab.jpg#originWidth=1600...
  if (!wixUrl || !wixUrl.startsWith("wix:image://")) return wixUrl;

  const parts = wixUrl.split("/");
  const last = parts[parts.length - 1]; // xxxxx~mv2.jpg#originWidth=...
  const idPart = parts[2]; // v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg...

  // idPart = "v1/2e3f8a_00...~mv2.jpg"
  const id = idPart.split("/")[1].split("~")[0]; // 2e3f8a_008affd73da44d5c918dd3fe197c04b7

  let url = `https://static.wixstatic.com/media/${id}.jpg`;

  // Wix bazen 403 atmaması için ?raw=1 istiyor
  if (!url.includes("?")) {
    url = `${url}?raw=1`;
  } else if (!url.includes("raw=")) {
    url = `${url}&raw=1`;
  }

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
    const bodyText = await resp.text().catch(() => "");
    console.error("Response body:", bodyText);
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
// 6) Gemini 2.5 Flash Image ile IMAGE + TEXT → IMAGE
// ----------------------
async function generateWithGeminiFlashImage({ prompt, slabBase64, slabMime }) {
  console.log("[Gemini2.5FlashImage] Prompt:", prompt);

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  // Gemini image generation:
  // text + inlineData (base64 image) birlikte "parts" içine gönderiliyor.
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
    throw new Error("Gemini 2.5 Flash Image boş response döndürdü.");
  }

  // parts içinde inlineData olan kısmı bul
  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    throw new Error(
      "Gemini 2.5 Flash Image cevabında görsel inlineData bulunamadı."
    );
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
    // 1) Wix URL → static HTTPS (+raw=1)
    const httpsUrl = wixToHttps(slabImageUrl);

    // 2) Slab'i indir → base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) Blue Jeans Marble vurgusunu prompt'a zenginleştir
    const enrichedPrompt = (slabLabel
      ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
      : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
    ).trim();

    // 4) Gemini 2.5 Flash Image ile image+text → image
    const { imageBase64, mimeType } = await generateWithGeminiFlashImage({
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
        "Gemini 2.5 Flash Image isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 8) SERVER’I BAŞLAT
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Gemini 2.5 Flash Image Engine listening on port ${PORT}`
  );
});
