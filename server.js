// server.js
// BlueJeans AI Design Engine – Gemini 2.5 Flash Image (TEXT + IMAGE → IMAGE)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ----------------------
// 1) ENV
// ----------------------
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY ortam değişkeni tanımlı değil. Render Environment kısmına eklemelisin."
  );
  process.exit(1);
}

// 🔑 Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Ana model ismi – TEXT + IMAGE → IMAGE
// (Model adı: Gemini 2.5 Flash Image – resmi API adı bu şekilde *olduğunda*
//  çalışmazsa, buradan tekrar güncelleriz.)
const MODEL_NAME = "gemini-2.5-flash";

// Yedek model (sadece text → image, gerekirse)
const FALLBACK_MODEL_NAME = "gemini-2.0-flash";

// ----------------------
// 2) EXPRESS
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/", (_req, res) => {
  res.send("BlueJeans Gemini 2.5 Flash Image Engine is running 🧠🟦");
});

// ----------------------
// 3) wix:image:// → HTTPS URL (güçlü & güvenli)
// ----------------------
function wixToHttps(wixUrl) {
  if (typeof wixUrl !== "string" || !wixUrl.length) {
    console.warn("[wixToHttps] Non-string veya boş URL geldi:", wixUrl);
    return wixUrl;
  }

  // Zaten normal https ise dokunma
  if (!wixUrl.startsWith("wix:image://")) {
    return wixUrl;
  }

  try {
    // Örnek:
    // wix:image://v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans-slab_lot-802.jpg#originWidth=1600&originHeight=1200
    const PREFIX = "wix:image://";
    const afterPrefix = wixUrl.slice(PREFIX.length); // v1/...

    const firstSlash = afterPrefix.indexOf("/");
    if (firstSlash === -1) {
      console.warn("[wixToHttps] Beklenmeyen wix:image formatı:", wixUrl);
      return wixUrl;
    }

    // "2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans..."
    const mediaPart = afterPrefix.slice(firstSlash + 1);
    const firstSlashMedia = mediaPart.indexOf("/");
    const idWithExt =
      firstSlashMedia === -1 ? mediaPart : mediaPart.slice(0, firstSlashMedia);
    // idWithExt: "2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg"

    const [idPart, tail] = idWithExt.split("~"); // idPart: "2e3f8a_...", tail: "mv2.jpg"
    const extMatch = tail && tail.match(/\.(jpg|jpeg|png|webp)/i);
    const ext = extMatch ? extMatch[0] : ".jpg";

    const httpsUrl = `https://static.wixstatic.com/media/${idPart}${ext}?raw=1`;
    console.log("[wixToHttps] wix:image →", httpsUrl);
    return httpsUrl;
  } catch (err) {
    console.error("[wixToHttps] Parse hatası, orijinal URL geri dönüyor:", err);
    return wixUrl;
  }
}

// ----------------------
// 4) Resmi indir → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);
  const resp = await fetch(url);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(
      "[downloadImageToBase64] HTTP hata:",
      resp.status,
      resp.statusText,
      "Body:",
      text
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
// 5) Gemini 2.5 Flash Image ile TEXT+IMAGE → IMAGE
// ----------------------
async function generateWithGeminiImage({ prompt, slabBase64, slabMime }) {
  console.log("[GeminiImage] Prompt:", prompt);

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

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

  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    throw new Error("Gemini cevabında görsel inlineData bulunamadı.");
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return { imageBase64, mimeType };
}

// ----------------------
// 6) Ana endpoint: /api/design
// ----------------------
app.post("/api/design", async (req, res) => {
  const { prompt, slabImageUrl, slabLabel } = req.body || {};

  console.log("📥 [/api/design] Body:", { prompt, slabImageUrl, slabLabel });

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: "Prompt boş olamaz." });
  }

  if (!slabImageUrl || typeof slabImageUrl !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "slabImageUrl eksik veya hatalı." });
  }

  try {
    // 1) wix:image:// → HTTPS
    const httpsUrl = wixToHttps(slabImageUrl);

    // 2) Slab fotoğrafını indir → base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) Blue Jeans Marble vurgusuyla prompt’u zenginleştir
    const enrichedPrompt = (
      slabLabel
        ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
        : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
    ).trim();

    // 4) Gemini TEXT+IMAGE → IMAGE
    const { imageBase64, mimeType } = await generateWithGeminiImage({
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
        "Gemini 2.5 Flash Image isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 7) START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Gemini 2.5 Flash Image Engine listening on port ${PORT}`
  );
});
