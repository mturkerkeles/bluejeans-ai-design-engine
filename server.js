// Blue Jeans AI Design Engine — FULL IMAGE MODEL (Gemini 3 Pro Image Preview)

import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Google client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// -------------------------------------------
//  Convert wix:image:// → static.wixstatic.com
// -------------------------------------------
function normalizeWixUrl(url) {
  if (!url.startsWith("wix:image://")) return url;

  let cleaned = url
    .replace("wix:image://v1/", "")
    .split("/")[0]
    .split("#")[0];

  return `https://static.wixstatic.com/media/${cleaned}`;
}

// -------------------------------------------
//  Download image → base64
// -------------------------------------------
async function downloadAsBase64(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(res.data, "binary");
  return {
    base64: buffer.toString("base64"),
    mime: res.headers["content-type"] || "image/jpeg",
  };
}

// -------------------------------------------
//  MAIN ENDPOINT (Wix calls this)
// -------------------------------------------
app.post("/api/design", async (req, res) => {
  try {
    const { prompt, slabImageUrl, slabLabel } = req.body;

    if (!prompt || !slabImageUrl) {
      return res.status(400).json({ ok: false, error: "Missing prompt or image" });
    }

    // 1) Fix Wix URL
    const downloadUrl = normalizeWixUrl(slabImageUrl);

    // 2) Download slab image
    const { base64, mime } = await downloadAsBase64(downloadUrl);

    // 3) Gemini 3 Pro Image call
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mime,
                data: base64,
              },
            },
            {
              text: `
You are an advanced interior design AI.
Use the provided BLUE JEANS MARBLE slab as the PRIMARY MATERIAL.
Generate a photorealistic interior render according to this prompt:

"${prompt}"

The design MUST use the slab visually and realistically.
Slab: ${slabLabel || "Blue Jeans Marble"}

Output ONLY the final rendered image.
              `,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 32,
        maxOutputTokens: 2048,
      },
    });

    // 4) Extract generated image
    let generated;
    try {
      generated =
        result.response.candidates[0].content.parts.find((p) => p.inlineData);
    } catch (e) {
      generated = null;
    }

    if (!generated) {
      return res.status(500).json({
        ok: false,
        error: "No image returned from Gemini 3 Pro Image Model",
      });
    }

    const outMime = generated.inlineData.mimeType || "image/png";
    const outB64 = generated.inlineData.data;

    return res.json({
      ok: true,
      mimeType: outMime,
      imageBase64: outB64,
      model: "gemini-3-pro-image-preview",
      received: {
        prompt,
        slabImageUrl,
        downloadUrl,
        slabLabel,
      },
    });
  } catch (err) {
    console.error("❌ /api/design ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------
app.get("/", (_, res) =>
  res.send("BlueJeans AI Engine — Gemini 3 Pro Image Model Running ⚡️")
);

app.listen(PORT, () =>
  console.log(`🔥 BlueJeans AI Engine listening on port ${PORT}`)
);
