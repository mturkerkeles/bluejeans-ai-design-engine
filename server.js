// server.js
// BlueJeans AI Design Engine – Gemini 2.5 Flash (Nano Banana) IMAGE + TEXT → IMAGE

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ----------------------
// 1) ENV VARS & GEMINI CLIENT
// ----------------------
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY ortam değişkeni tanımlı değil. " +
      "Render Dashboard → Environment → GEMINI_API_KEY eklemelisin."
  );
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🔵 Hedef model: Gemini 2.5 Flash (Nano Banana)
const MODEL_NAME = "gemini-2.5-flash";

// ----------------------
// 2) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => {
  res.send("BlueJeans Gemini 2.5 Flash Image Engine is running 🧠🟦");
});

// ----------------------
// 3) Wix URL → HTTPS gerçek URL
// ----------------------
function wixToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== "string") {
    throw new Error("Geçersiz slabImageUrl (undefined veya string değil).");
  }

  if (!wixUrl.startsWith("wix:image://")) {
    // Zaten normal https ise dokunma
    return wixUrl;
  }

  // Örn: wix:image://v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans-slab_lot-802.jpg#originWidth=1600&originHeight=1200
  const parts = wixUrl.split("/");
  const last = parts[parts.length - 1]; // blue-jeans-slab_lot-802.jpg#...
  const idPart = parts[parts.length - 2]; // 2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg

  const id = idPart.split("~")[0]; // 2e3f8a_008affd73da44d5c918dd3fe197c04b7

  // raw=1 ekleyerek, hotlink korumayı aşma şansımız artar
  return `https://static.wixstatic.com/media/${id}~mv2.jpg?raw=1`;
}

// ----------------------
// 4) Slab resmini indir → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);
  const resp = await fetch(url);

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    console.error(
      `Slab image download failed: ${resp.status} ${resp.statusText} | body: ${bodyText}`
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
// 5) Gemini 2.5 Flash ile IMAGE + TEXT → IMAGE
// ----------------------
async function generateWithGeminiFlash({ prompt, slabBase64, slabMime }) {
  console.log("[Gemini2.5Flash] Prompt:", prompt);

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  // ÖNEMLİ:
  // Burada responseMimeType göndermiyoruz.
  // Bazı eski modeller sadece text/json kabul ediyor.
  // 2.5 Flash image destekliyorsa inlineData ile dönecek.
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
    throw new Error("Gemini 2.5 Flash boş response döndürdü.");
  }

  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    throw new Error(
      "Gemini 2.5 Flash cevabında görsel inlineData bulunamadı (model sadece text döndürüyor olabilir)."
    );
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

// ----------------------
// 6) ANA ENDPOINT: /api/design
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
    // 1) Wix URL → HTTPS
    const httpsUrl = wixToHttps(slabImageUrl);

    // 2) Slab indir → base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) Prompt zenginleştirme
    const enrichedPrompt = (slabLabel
      ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
      : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
    ).trim();

    // 4) Gemini 2.5 Flash ile image+text → image
    const { imageBase64, mimeType } = await generateWithGeminiFlash({
      prompt: enrichedPrompt,
      slabBase64,
      slabMime,
    });

    return res.json({
      ok: true,
      imageBase64,
      mimeType,
      model: MODEL_NAME,
      received: { prompt, slabImageUrl, slabLabel },
    });
  } catch (err) {
    console.error("🔥 [/api/design] ERROR:", err);
    return res.status(500).json({
      ok: false,
      error:
        err.message ||
        "Gemini 2.5 Flash isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 7) SERVER’I BAŞLAT
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Gemini 2.5 Flash Image Engine listening on port ${PORT}`
  );
});
