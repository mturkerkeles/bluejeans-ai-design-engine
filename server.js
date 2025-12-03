import express from "express";
import cors from "cors";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "30mb" }));

// YENİ MODEL → Gemini 3.0 Pro
const MODEL_NAME = "gemini-3.0-pro";

// Google AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// ------------------------------
//   API /design (Wix çağırıyor)
// ------------------------------
app.post("/api/design", async (req, res) => {
  console.log("📩 /api/design called with:", req.body);

  try {
    const { prompt, slabImageUrl, slabLabel } = req.body;

    // -------- 1) Slab görselini indir --------
    console.log("🔍 Downloading slab image from:", slabImageUrl);

    const rawImage = await axios.get(slabImageUrl, {
      responseType: "arraybuffer"
    });
    const base64Slab = Buffer.from(rawImage.data).toString("base64");
    const mimeType = rawImage.headers["content-type"] || "image/jpeg";

    // -------- 2) Gemini 3 Pro isteği --------
    console.log("🤖 Sending request to Gemini 3.0 Pro...");

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
              You are an AI marble interior designer.
              Use the provided Blue Jeans Marble slab image to generate a realistic interior render matching this prompt:
              "${prompt}". 
              Ensure the marble texture is applied naturally and consistently.
              `
            },
            {
              inlineData: {
                mimeType,
                data: base64Slab,
              }
            }
          ]
        }
      ]
    });

    // Görsel çıktıyı al
    const imagePart = result.response.candidates[0].content.parts.find(
      p => p.inlineData
    );

    if (!imagePart) {
      throw new Error("No inlineData image returned");
    }

    const outMime = imagePart.inlineData.mimeType || "image/png";
    const outBase64 = imagePart.inlineData.data;

    return res.json({
      ok: true,
      mimeType: outMime,
      imageBase64: outBase64,
      received: { prompt, slabImageUrl, slabLabel }
    });
  }

  catch (err) {
    console.error("❌ /api/design ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

// ------------------------------
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine (Gemini 3.0 Pro) is running.");
});

app.listen(10000, () => {
  console.log("🚀 BlueJeans AI Design Engine (Gemini 3 Pro) listening on port 10000");
});
