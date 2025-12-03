// server.js — BlueJeans AI Engine (Imagen 4)

// -------------------------
// Imports
// -------------------------
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

// -------------------------
// App Setup
// -------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GOOGLE_API_KEY;

console.log("🚀 BlueJeans AI Engine (Imagen 4) starting...");

// -------------------------
// Google Imagen 4 Init
// -------------------------
const genAI = new GoogleGenerativeAI(API_KEY);

// MODEL → Imagen 4
const MODEL_NAME = "google-imagen-4.0-generate";

// -------------------------
// Convert wix:image:// → public https:// URL
// -------------------------
function wixToStaticUrl(wixUrl) {
  return wixUrl
    .replace("wix:image://v1/", "https://static.wixstatic.com/media/")
    .replace("~mv2", "");
}

// -------------------------
// POST /api/design
// -------------------------
app.post("/api/design", async (req, res) => {
  try {
    const { prompt, slabImageUrl } = req.body;

    console.log("📩 /api/design called:", req.body);

    if (!prompt || !slabImageUrl) {
      return res.status(400).json({ ok: false, error: "Missing prompt or image" });
    }

    // 1) Convert Wix URL to static URL
    const staticUrl = wixToStaticUrl(slabImageUrl);
    console.log("🖼️ Slab URL converted:", staticUrl);

    // 2) Download slab image → Base64
    console.log("⏳ Downloading slab...");
    const imgResp = await fetch(staticUrl);
    const imgBuffer = await imgResp.arrayBuffer();
    const base64Image = Buffer.from(imgBuffer).toString("base64");
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";

    // 3) Call Imagen 4 (image + text)
    console.log("🎨 Calling Imagen-4...");

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Image
        }
      },
      prompt
    ]);

    const response = await result.response;
    const imageBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!imageBase64) {
      console.log("❌ Imagen-4 did not return image");
      return res.status(500).json({
        ok: false,
        error: "Imagen-4 returned no image output"
      });
    }

    console.log("✅ Imagen-4 OK: image generated");

    return res.json({
      ok: true,
      imageBase64,
      mimeType
    });

  } catch (err) {
    console.error("🔥 /api/design ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Unknown backend error"
    });
  }
});

// -------------------------
app.listen(PORT, () => {
  console.log(`🔥 BlueJeans AI Engine (Imagen-4) live on port ${PORT}`);
});
