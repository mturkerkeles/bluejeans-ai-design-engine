// server.js
// BlueJeans AI Design Engine – Node.js sunucusu

const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Health-check endpoint
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine is running 🧠🟦");
});

// Main endpoint: /design
app.post("/design", async (req, res) => {
  try {
    const { prompt, slabImageUrl, slabLabel } = req.body || {};

    if (!prompt || !slabImageUrl) {
      return res.status(400).json({ ok: false, error: "Missing prompt or slabImageUrl" });
    }

    console.log("Incoming /design request:", { slabImageUrl, slabLabel });

    // 1) Download slab image
    const optimizedUrl = getOptimizedImageUrl(slabImageUrl);

    const imgResponse = await axios.get(optimizedUrl, {
      responseType: "arraybuffer",
      timeout: 30000
    });

    const base64Image = Buffer.from(imgResponse.data).toString("base64");
    const mimeType = "image/jpeg";

    // 2) Build AI prompt
    const fullPrompt = buildPrompt(prompt, slabLabel);

    const body = {
      contents: [
        {
          parts: [
            { text: fullPrompt },
            {
              inlineData: {
                mimeType,
                data: base64Image
              }
            }
          ]
        }
      ]
    };

    // 3) Call Gemini
    const aiResponse = await axios.post(
      `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`,
      body,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 40000
      }
    );

    const parts = aiResponse.data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.data);

    if (!imagePart) {
      console.error("Gemini returned no image:", aiResponse.data);
      return res.status(500).json({
        ok: false,
        error: "Gemini returned no inline image"
      });
    }

    return res.json({
      ok: true,
      mimeType: imagePart.inlineData.mimeType,
      imageBase64: imagePart.inlineData.data,
      source: "gemini"
    });

  } catch (err) {
    console.error("AI Engine error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Unknown server error"
    });
  }
});

// Function to optionally optimize Wix images
function getOptimizedImageUrl(url) {
  return url;
}

// Blue Jeans Marble Special Prompt
function buildPrompt(userPrompt, slabLabel) {
  return `
You are an elite interior designer creating photorealistic scenes using Blue Jeans Marble.

Material rules:
- Material is Blue Jeans Marble.
- Keep the blue-denim veining, bronze areas, and white calcite lines true to reality.
- Do not recolor, repaint, or blur the stone.
- Always showcase slab ${slabLabel} clearly.

Task:
Generate ONE ultra-photorealistic render of:

"${userPrompt}"

Stone may be applied to:
- kitchen island
- countertop
- backsplash
- feature wall
- bar counter
- spa wall
- reception desk

Lighting must be realistic and luxurious.
`.trim();
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("BlueJeans AI Design Engine running on port", PORT);
});
