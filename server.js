// server.js
// BlueJeans AI Design Lab – Gemini 3 Pro Image (Nano Banana Pro) backend
// TAM GÜNCEL SÜRÜM: 5 Dakika Timeout + Doku Sadakati (Texture Fidelity)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ----------------------
// 1) ENV + GEMINI CLIENT
// ----------------------
const PORT = process.env.PORT || 8080;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY environment variable is missing. " +
      "Please set it in Render Dashboard → Environment → GEMINI_API_KEY"
  );
  process.exit(1);
}

// 🛑 MODEL: Gemini 3 Pro Image (En Yüksek Kalite)
const MODEL_NAME = "gemini-3-pro-image-preview";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ----------------------
// 2) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
// Büyük resimler için limit 20mb
app.use(express.json({ limit: "20mb" })); 

app.get("/", (_req, res) => {
  res.send("BlueJeans **Gemini 3 Pro Image Engine** (High Fidelity) is running 🧠🟦");
});

// ----------------------
// 3) Helper: Wix URL → static.wixstatic.com
// ----------------------
function wixToHttps(wixUrl) {
  try {
    if (!wixUrl || typeof wixUrl !== "string") return null;
    if (wixUrl.startsWith("http://") || wixUrl.startsWith("https://")) return wixUrl;
    if (!wixUrl.startsWith("wix:image://")) return null;

    const withoutPrefix = wixUrl.replace("wix:image://v1/", "");
    const firstSlashIdx = withoutPrefix.indexOf("/");
    const idWithExt = firstSlashIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstSlashIdx); 
    return `https://static.wixstatic.com/media/${idWithExt}?raw=1`;
  } catch (err) {
    console.error("[wixToHttps] ERROR:", err);
    return null;
  }
}

// ----------------------
// 4) Helper: Resim İndir → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Slab image download failed: ${resp.status} ${resp.statusText}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString("base64");
  const mimeType = resp.headers.get("content-type") || "image/jpeg";
  return { base64, mimeType };
}

// ----------------------
// 5) Helper: Gemini 3 Pro Image Generation
// ----------------------
async function generateWithGeminiFlashImage({ prompt, slabBase64, slabMime }) {
  console.log("[Gemini3Pro] Generating with 5-minute timeout & High Fidelity...");

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
  });

  // 🛑 FIX 1: API Timeout 5 Dakika (300.000 ms)
  const requestOptions = {
    timeout: 300000, 
  };

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          slabBase64 && slabMime
            ? {
                inlineData: {
                  mimeType: slabMime,
                  data: slabBase64,
                },
              }
            : null,
          {
            text: prompt,
          },
        ].filter(Boolean),
      },
    ],
  }, requestOptions);

  const candidate = result?.response?.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    throw new Error("Gemini 3 Pro Image returned an empty response.");
  }

  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error("[Gemini3Pro] Full response parts:", candidate.content.parts);
    const textPart = candidate.content.parts.find((p) => p.text);
    const errorDetail = textPart
      ? `Model returned only text: "${textPart.text.substring(0, 100)}..."`
      : "Response does not contain inline image data.";
    throw new Error(`Image generation failed. ${errorDetail}`);
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return { imageBase64, mimeType };
}

// ----------------------
// 6) MAIN ENDPOINT: /api/design
// ----------------------
app.post("/api/design", async (req, res) => {
  // 🛑 FIX 2: İstek Bazlı Timeout (5 Dakika) - Render 504 hatasını önler
  req.setTimeout(300000); 

  const { prompt, slabImageUrl, slabLabel } = req.body || {};
  console.log("📥 [/api/design] Body:", { prompt, slabImageUrl, slabLabel });

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: "Prompt cannot be empty." });
  }

  if (!slabImageUrl) {
    return res.status(400).json({ ok: false, error: "slabImageUrl is missing." });
  }

  try {
    const httpsUrl = wixToHttps(slabImageUrl);
    if (!httpsUrl) {
      throw new Error("Could not convert slabImageUrl to a valid https URL.");
    }

    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // ---------------------------------------------------------
    // 🛑 TEXTURE FIDELITY (Doku Sadakati) PROMPT AYARI
    // ---------------------------------------------------------
    // Modelin kendi kafasından taş uydurmasını engellemek için:
    
    const systemInstruction = `
    You are an advanced 3D architectural visualizer specializing in 'Texture Mapping' and 'Photorealistic Rendering'.
    
    TASK:
    Generate a high-resolution (8K), photorealistic interior/exterior scene based on the USER REQUEST below.
    
    CRITICAL MATERIAL INSTRUCTION (MANDATORY):
    1. The Input Image provided is a specific slab of "Blue Jeans Marble" (Quarry: Erzurum, Turkey).
    2. YOU MUST USE THE INPUT IMAGE AS THE EXACT TEXTURE SOURCE.
    3. Do NOT generate a generic blue marble. Do NOT hallucinate new veins.
    4. Project the pattern, colors, and unique defects of the Input Image directly onto the target surfaces (countertops, walls, etc.).
    5. Maintain the exact vein structure and "Bookmatch" alignment if visible in the input.
    6. The finish must be "High Gloss Polished" with physically accurate reflections (PBR).
    
    SCENE STYLE:
    - Cinematic lighting, expensive atmosphere, architectural photography style.
    - Aspect Ratio: 16:9.
    - No text, no logos, no watermarks.
    `.trim();

    const finalPrompt = `
    ${systemInstruction}
    
    USER REQUEST: ${prompt}
    `.trim();

    // 4) Gemini 3 Pro'yu Çağır
    const { imageBase64, mimeType } = await generateWithGeminiFlashImage({
      prompt: finalPrompt,
      slabBase64,
      slabMime,
    });

    // 5) Sonucu Döndür
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
      error: err.message || "Gemini 3 Pro request failed. Please try again.",
    });
  }
});

// ----------------------
// 7) START SERVER
// ----------------------
const server = app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans **Gemini 3 Pro Image Engine** (Nano Banana Pro) listening on port ${PORT}`
  );
});

// 🛑 FIX 3: GLOBAL SERVER TIMEOUT (5 Dakika)
// Bu ayar Render sunucusunun bağlantıyı erken kesmesini engeller.
server.setTimeout(300000);
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;
