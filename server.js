// server.js
// BlueJeans AI Design Lab – Gemini 3 Pro Image (Nano Banana Pro) backend
// IMAGE + TEXT → IMAGE with advanced Blue Jeans Marble pre-prompt
// CRITICAL FIX: 5-Minute Timeouts to prevent Render 504 Errors

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

// 🛑 MODEL CHANGE: Upgraded to Gemini 3 Pro Image
const MODEL_NAME = "gemini-3-pro-image-preview";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ----------------------
// 2) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
// Set a generous body size limit for large base64 slab images
app.use(express.json({ limit: "20mb" })); 

app.get("/", (_req, res) => {
  res.send("BlueJeans **Gemini 3 Pro Image Engine** is running 🧠🟦");
});

// ----------------------
// 3) Helper: Wix URL → static.wixstatic.com
// ----------------------
function wixToHttps(wixUrl) {
  try {
    if (!wixUrl || typeof wixUrl !== "string") return null;

    // If it's already https, just return
    if (wixUrl.startsWith("http://") || wixUrl.startsWith("https://")) {
      return wixUrl;
    }

    // Expected form: wix:image://v1/...
    if (!wixUrl.startsWith("wix:image://")) {
      console.warn("[wixToHttps] Unknown URL format:", wixUrl);
      return null;
    }

    const withoutPrefix = wixUrl.replace("wix:image://v1/", "");
    const firstSlashIdx = withoutPrefix.indexOf("/");

    const idWithExt =
      firstSlashIdx === -1
        ? withoutPrefix
        : withoutPrefix.slice(0, firstSlashIdx); 

    const mediaId = idWithExt; 
    const httpsUrl = `https://static.wixstatic.com/media/${mediaId}?raw=1`;
    console.log("[wixToHttps] wix:image →", httpsUrl);
    return httpsUrl;
  } catch (err) {
    console.error("[wixToHttps] ERROR:", err);
    return null;
  }
}

// ----------------------
// 4) Helper: download image → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);

  const resp = await fetch(url);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
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
// 5) Helper: Gemini 3 Pro Image Generation
// ----------------------
async function generateWithGeminiFlashImage({ prompt, slabBase64, slabMime }) {
  console.log("[Gemini3Pro] Final prompt sent to model:", prompt);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
  });

  // 🛑 FIX 1: Increase Gemini API Client Timeout (5 Minutes)
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

  // Find the part that contains image data
  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error("[Gemini3Pro] No inlineData found:", candidate.content.parts);
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
  // 🛑 FIX 2: Set Request-Specific Timeout (5 Minutes)
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
    // 1) Convert Wix URL → https
    const httpsUrl = wixToHttps(slabImageUrl);
    if (!httpsUrl) {
      throw new Error("Could not convert slabImageUrl to a valid https URL.");
    }

    // 2) Download slab to base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) ADVANCED BLUE JEANS MARBLE PRE-PROMPT ENGINE
    const baseStyle = `
You are an expert architectural visualization and CGI renderer.
Generate an ultra-photorealistic, high-resolution (8K) interior or exterior scene with an **aspect ratio of 16:9**.
Use physically based rendering (PBR), realistic global illumination, soft natural or architectural lighting,
accurate shadows and reflections, and cinematic composition at human eye level.
**Ensure the lighting accurately highlights the unique characteristics and luster of the stone.**
Do not generate any text, watermarks, UI elements, or logos in the image.
    `.trim();

    const materialBlock = `
The core material is premium Blue Jeans Marble ${slabLabel || ""}, a quarry-origin exotic dolomitic marble from Erzurum, Turkey.
The generated scene must preserve the texture and pattern of the uploaded slab image: deep denim-blue tones,
dramatic veining with bronze and white accents, and a fine crystalline structure.
Use this slab image as the authoritative reference for color, veining direction and pattern density.
Apply this Blue Jeans Marble to the key surfaces described by the user.
The stone surface should appear highly polished with realistic reflections and subtle light bloom, without exaggeration.
    `.trim();

    const userBlock = `USER PROMPT: ${prompt}`;

    const finalPrompt = `
${baseStyle}

${materialBlock}

Now follow the user request exactly and compose the best possible scene:

${userBlock}
    `.trim();

    // 4) Call Gemini 3 Pro Image
    const { imageBase64, mimeType } = await generateWithGeminiFlashImage({
      prompt: finalPrompt,
      slabBase64,
      slabMime,
    });

    // 5) Send the result back
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
      error: err.message || "Gemini request failed. Please try again.",
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

// 🛑 FIX 3: Global Server Timeouts (Critical for Render 504 Errors)
// Forces the server to keep the connection open for 5 minutes (300,000 ms)
server.setTimeout(300000);
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;
