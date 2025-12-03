import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { VertexAI } from "@google-cloud/vertexai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(cors());

const port = process.env.PORT || 10000;

// 🔐 Google credentials JSON path
const GOOGLE_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// 🔥 Imagen 4.0 model adı
const MODEL_NAME = "imagen-4.0-generate-001";

// 🌍 VertexAI Client
const client = new VertexAI({
  projectId: process.env.GOOGLE_PROJECT_ID,
  location: "us-central1"
});

const model = client.getGenerativeModel({
  model: MODEL_NAME
});

// ---------------------------------------------------------
//   🔥  /api/design → main generation endpoint
// ---------------------------------------------------------
app.post("/api/design", async (req, res) => {
  try {
    const { prompt, slabImageUrl } = req.body;

    console.log("📥 Incoming Wix request:", { prompt, slabImageUrl });

    // ---------------------------------------------------------
    // 1) Download slab reference image (from wix:image:// → https)
    // ---------------------------------------------------------
    let base64Image = null;

    if (slabImageUrl.startsWith("wix:image://")) {
      const httpsUrl = convertWixToHttps(slabImageUrl);
      console.log("🌐 Converted slab URL:", httpsUrl);

      const buffer = await downloadImage(httpsUrl);
      base64Image = buffer.toString("base64");
    } else if (slabImageUrl.startsWith("http")) {
      const buffer = await downloadImage(slabImageUrl);
      base64Image = buffer.toString("base64");
    }

    // ---------------------------------------------------------
    // 2) Call Imagen 4.0
    // ---------------------------------------------------------
    console.log("🎨 Calling Imagen 4.0...");

    const result = await model.generateContent({
      prompt: prompt,
      image: {
        bytesBase64Encoded: base64Image
      }
    });

    const outputBase64 =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.image?.bytesBase64Encoded;

    if (!outputBase64) {
      console.log("❌ Imagen 4 returned empty output");
      return res.status(500).json({ ok: false, error: "Imagen 4 returned no image" });
    }

    console.log("✅ Imagen 4 generation complete");

    res.json({
      ok: true,
      imageBase64: outputBase64,
      mimeType: "image/png"
    });

  } catch (err) {
    console.error("🔥 /api/design ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
// Helper: Convert wix:image:// → https://static.wixstatic.com
// ---------------------------------------------------------
function convertWixToHttps(wixUrl) {
  const parts = wixUrl.split("/");
  const id = parts[parts.length - 1].split("~")[0];
  return `https://static.wixstatic.com/media/${id}`;
}

// ---------------------------------------------------------
// Helper: download image from URL to buffer
// ---------------------------------------------------------
async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to download slab image");
  return Buffer.from(await response.arrayBuffer());
}

app.listen(port, () => {
  console.log(`🔥 BlueJeans Imagen 4 Engine running on port ${port}`);
});
