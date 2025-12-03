// server.js
// BlueJeans AI Design Engine – Gemini 2.5 Flash (image + text → image)

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
    "[FATAL] GEMINI_API_KEY is missing. Please set it in Render → Environment."
  );
  process.exit(1);
}

const MODEL_NAME = "gemini-2.5-flash";

// Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
// 3) wix:image://  →  https://static.wixstatic.com/media/...
// ----------------------
function wixToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== "string") return null;

  if (!wixUrl.startsWith("wix:image://")) {
    // zaten normal https ise aynen kullan
    return wixUrl;
  }

  // Örnek:
  // wix:image://v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans.jpg#originWidth=1600&originHeight=1200
  try {
    const withoutScheme = wixUrl.replace("wix:image://", "");
    // v1/.../...
    const parts = withoutScheme.split("/");
    // parts[1] = "2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg"
    const idPart = parts[1];
    if (!idPart) return null;

    const directUrl = `https://static.wixstatic.com/media/${idPart}`;
    console.log("[wixToHttps] wix:image →", directUrl);
    return directUrl;
  } catch (e) {
    console.error("[wixToHttps] parse error:", e);
    return null;
  }
}

// ----------------------
// 4) Slab resmini indir → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);

  const resp = await fetch(url, {
    // Wix bazen UA / referer olmayan istekleri sevmiyor, gerçek browser gibi davranalım
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: "https://www.wix.com/",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(
      "⚠️ Slab image download failed:",
      resp.status,
      resp.statusText,
      "Body snippet:",
      text.slice(0, 200)
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
  console.log("[GeminiFlash] Prompt:", prompt);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    // responseMimeType **KOYMUYORUZ** → aksi halde 400 alıyoruz
    generationConfig: {
      temperature: 0.9,
    },
  });

  const parts = [{ text: prompt }];

  if (slabBase64 && slabMime) {
    parts.push({
      inlineData: {
        mimeType: slabMime,
        data: slabBase64,
      },
    });
  }

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts,
      },
    ],
  });

  const candidate = result?.response?.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    console.error("[GeminiFlash] Empty response:", result);
    throw new Error("Gemini 2.5 Flash returned an empty response.");
  }

  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error("[GeminiFlash] No inlineData image in response:", candidate);
    throw new Error("Gemini 2.5 Flash did not return an image.");
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return { imageBase64, mimeType };
}

// ----------------------
// 6) MAIN ENDPOINT  /api/design
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
    // 1) wix:image:// → https
    const httpsUrl = wixToHttps(slabImageUrl);
    if (!httpsUrl) {
      throw new Error("slabImageUrl formatı çözümlenemedi.");
    }

    // 2) Slab'i indir → base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) Prompt'u Blue Jeans Marble bilgisi ile zenginleştir
    const enrichedPrompt = (
      slabLabel
        ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
        : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
    ).trim();

    // 4) Gemini 2.5 Flash ile image + text → image
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
        err?.message ||
        "Gemini 2.5 Flash isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 7) SERVER START
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Gemini 2.5 Flash Image Engine listening on port ${PORT}`
  );
});
