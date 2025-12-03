// server.js
// BlueJeans AI Design Engine – Gemini 1.5 Flash (image + text → image)

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
const PORT = process.env.PORT || 10000;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY ortam değişkeni tanımlı değil. " +
      "Render Dashboard → Environment → GEMINI_API_KEY olarak eklemelisin."
  );
  process.exit(1);
}

// 🔑 Google Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Resim üretebilen stabil model
const MODEL_NAME = "gemini-1.5-flash";

// ----------------------
// 3) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Basit health-check
app.get("/", (req, res) => {
  res.send("BlueJeans Gemini 1.5 Flash Engine is running 🧠🟦");
});

// ----------------------
// 4) Wix URL → gerçek HTTPS URL
// ----------------------
function wixToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== "string") return wixUrl;

  // Örn: wix:image://v1/2e3f8a_xxxxx~mv2.jpg/...
  if (!wixUrl.startsWith("wix:image://")) return wixUrl;

  const parts = wixUrl.split("/");
  const last = parts[parts.length - 1]; // 2e3f8a_xxxxx~mv2.jpg#...
  const id = last.split("~")[0]; // 2e3f8a_xxxxx

  const httpsUrl = `https://static.wixstatic.com/media/${id}~mv2.jpg`;
  console.log("[wixToHttps] wix:image →", httpsUrl);
  return httpsUrl;
}

// ----------------------
// 5) Slab resmini indir → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Slab image download failed: ${resp.status} ${resp.statusText}`
    );
  }

  const arrayBuf = await resp.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString("base64");
  const mimeType = resp.headers.get("content-type") || "image/jpeg";

  console.log("✅ Slab image downloaded, mimeType:", mimeType);
  return { base64, mimeType };
}

// ----------------------
// 6) Gemini 1.5 Flash ile IMAGE + TEXT → IMAGE
// ----------------------
async function generateWithGeminiImage({ prompt, slabBase64, slabMime }) {
  console.log("[Gemini] Prompt:", prompt);

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const request = {
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
  };

  console.log("[Gemini] Request parts count:", request.contents[0].parts.length);

  const result = await model.generateContent(request);
  const response = result.response;

  console.log(
    "[Gemini] Raw response candidates length:",
    response?.candidates?.length
  );

  const candidate = response?.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    console.error("[Gemini] Empty candidate:", JSON.stringify(response, null, 2));
    throw new Error("Gemini boş response döndürdü.");
  }

  // parts içinde inlineData olan kısmı bul
  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error(
      "[Gemini] image inlineData bulunamadı. content:",
      JSON.stringify(candidate.content, null, 2)
    );
    throw new Error("Gemini cevabında görsel inlineData bulunamadı.");
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  console.log("[Gemini] Image generated, mimeType:", mimeType);
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

    // 4) Gemini 1.5 Flash ile image + text → image
    const { imageBase64, mimeType } = await generateWithGeminiImage({
      prompt: enrichedPrompt,
      slabBase64,
      slabMime,
    });

    console.log("[/api/design] SUCCESS – sending image to Wix");
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
        "Gemini (image) isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 8) SERVER’I BAŞLAT
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Gemini 1.5 Flash Engine listening on port ${PORT}`
  );
});
