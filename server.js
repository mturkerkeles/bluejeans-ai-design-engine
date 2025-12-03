// server.js
// BlueJeans AI Design Lab – Gemini 3 Pro Image (Nano Banana Pro) backend
// IMAGE + TEXT → IMAGE with advanced Blue Jeans Marble pre-prompt

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

// 🛑 MODEL CHANGE: Upgraded to Gemini 3 Pro Image (Nano Banana Pro) for 
// maximum photorealism and control. This is the official preview model name.
const MODEL_NAME = "gemini-3-pro-image-preview";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ----------------------
// 2) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/", (_req, res) => {
  res.send("BlueJeans **Gemini 3 Pro Image Engine** (Nano Banana Pro) is running 🧠🟦");
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

    // Expected form:
    // wix:image://v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans-slab_lot-802.jpg#originWidth=1600&originHeight=1200
    if (!wixUrl.startsWith("wix:image://")) {
      console.warn("[wixToHttps] Unknown URL format:", wixUrl);
      return null;
    }

    const withoutPrefix = wixUrl.replace("wix:image://v1/", "");
    const firstSlashIdx = withoutPrefix.indexOf("/");

    const idWithExt =
      firstSlashIdx === -1
        ? withoutPrefix
        : withoutPrefix.slice(0, firstSlashIdx); // e.g. 2e3f8a_00...~mv2.jpg

    const mediaId = idWithExt; // already includes extension

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
    console.error(
      "[downloadImageToBase64] HTTP error:",
      resp.status,
      resp.statusText,
      "Body snippet:",
      text?.slice(0, 300)
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
// 5) Helper: Gemini 3 Pro Image – image+text → image
// ----------------------
async function generateWithGeminiFlashImage({ prompt, slabBase64, slabMime }) {
  console.log("[Gemini3ProImage] Final prompt sent to model:", prompt);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
  });

  // We send both the slab image and the textual instructions together.
  // This structure works perfectly for Gemini 3 Pro Image.
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
  });

  const candidate = result?.response?.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    throw new Error("Gemini 3 Pro Image returned an empty response.");
  }

  // Find the part that contains image data
  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error(
      "[Gemini3ProImage] Full candidate parts (no inlineData found):",
      candidate.content.parts
    );
    // The model may sometimes return only text (a description or rejection).
    const textPart = candidate.content.parts.find((p) => p.text);
    const errorDetail = textPart
      ? `Model returned only text: "${textPart.text.substring(0, 100)}..."`
      : "Response does not contain inline image data.";
    throw new Error(
      `Image generation failed. ${errorDetail}`
    );
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return { imageBase64, mimeType };
}

// ----------------------
// 6) MAIN ENDPOINT: /api/design
// ----------------------
app.post("/api/design", async (req, res) => {
  const { prompt, slabImageUrl, slabLabel } = req.body || {};

  console.log("📥 [/api/design] Body:", { prompt, slabImageUrl, slabLabel });

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({
      ok: false,
      error: "Prompt cannot be empty.",
    });
  }

  if (!slabImageUrl) {
    return res.status(400).json({
      ok: false,
      error: "slabImageUrl is missing. Please select a slab first.",
    });
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

    // (A) Global rendering style
    // NOTE: Kept 4K for instruction, G3PI handles high resolution natively.
    const baseStyle = `
You are an expert architectural visualization and CGI renderer.
Generate an ultra-photorealistic, high-resolution (4K or higher) interior or exterior scene.
Use physically based rendering (PBR), realistic global illumination, soft natural or architectural lighting,
accurate shadows and reflections, and cinematic composition at human eye level.
**Ensure the lighting accurately highlights the unique characteristics and luster of the stone.**
Do not generate any text, watermarks, UI elements, or logos in the image.
    `.trim();

    // (B) Blue Jeans Marble material focus
    const materialBlock = slabLabel
      ? `
The core material is premium Blue Jeans Marble ${slabLabel}, a quarry-origin exotic dolomitic marble from Erzurum, Turkey.
The generated scene must preserve the texture and pattern of the uploaded slab image: deep denim-blue tones,
dramatic veining with bronze and white accents, and a fine crystalline structure.
Use this slab image as the authoritative reference for color, veining direction and pattern density.
Apply this Blue Jeans Marble to the key surfaces described by the user (for example: countertops, kitchen islands,
bathroom vanities, shower walls, feature walls, flooring, fireplaces, or reception desks).
The stone surface should appear highly polished with realistic reflections and subtle light bloom, without exaggeration.
      `.trim()
      : `
The core material is premium Blue Jeans Marble, a quarry-origin exotic dolomitic marble from Erzurum, Turkey.
The generated scene must preserve the texture and pattern of the uploaded slab image: deep denim-blue tones,
dramatic veining with bronze and white accents, and a fine crystalline structure.
Use this slab image as the authoritative reference for color, veining direction and pattern density.
Apply this Blue Jeans Marble to the key surfaces described by the user (for example: countertops, kitchen islands,
bathroom vanities, shower walls, feature walls, flooring, fireplaces, or reception desks).
The stone surface should appear highly polished with realistic reflections and subtle light bloom, without exaggeration.
      `.trim();

    // (C) User request
    const userBlock = `USER PROMPT: ${prompt}`;

    // Final combined prompt
    const finalPrompt = `
${baseStyle}

${materialBlock}

Now follow the user request exactly and compose the best possible scene:

${userBlock}
    `.trim();

    // 4) Call Gemini 3 Pro Image – image+text → image
    // NOTE: The generateWithGeminiFlashImage helper function is retained, but the
    // model being called is now the powerful gemini-3-pro-image-preview.
    const { imageBase64, mimeType } = await generateWithGeminiFlashImage({
      prompt: finalPrompt,
      slabBase64,
      slabMime,
    });

    return res.json({
      ok: true,
      imageBase64,
      mimeType,
      model: MODEL_NAME, // Report the new model name in the response
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
        "Gemini 3 Pro Image request failed with an unexpected error. Please try again.",
    });
  }
});

// ----------------------
// 7) START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans **Gemini 3 Pro Image Engine** (Nano Banana Pro) listening on port ${PORT}`
  );
});
