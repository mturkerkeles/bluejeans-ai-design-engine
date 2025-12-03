// server.js
// BlueJeans AI Design Engine – Gemini 1.5 Flash (Text + Image → Image)

// ----------------------
// 1) IMPORTS
// ----------------------
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ----------------------
// 2) ENV & CLIENT
// ----------------------
const PORT = process.env.PORT || 8080;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY is not set. " +
      "Please add GEMINI_API_KEY in Render → Environment."
  );
  process.exit(1);
}

// IMPORTANT: model id WITHOUT `models/` prefix or `-002` suffix
const MODEL_NAME = "gemini-1.5-flash";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ----------------------
// 3) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => {
  res.send("BlueJeans Gemini 1.5 Flash Image Engine is running 🧠🟦");
});

// ----------------------
// 4) wix:image:// → https://static.wixstatic.com/... ?raw=1
// ----------------------
function wixToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== "string") {
    console.warn("[wixToHttps] invalid url:", wixUrl);
    return wixUrl;
  }

  if (!wixUrl.startsWith("wix:image://")) {
    // already a normal URL
    return wixUrl;
  }

  // Example:
  // wix:image://v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans-slab_lot-802.jpg#originWidth=1600&originHeight=1200
  const withoutPrefix = wixUrl.replace("wix:image://", "");
  const firstSlashIndex = withoutPrefix.indexOf("/");
  if (firstSlashIndex === -1) {
    console.warn("[wixToHttps] unexpected format:", wixUrl);
    return wixUrl;
  }

  // "v1/2e3f8a_...~mv2.jpg/..."  → we want the part after v1/
  const afterVersion = withoutPrefix.substring(firstSlashIndex + 1); // "2e3f8a_...~mv2.jpg/..."
  const imageId = afterVersion.split("/")[0]; // "2e3f8a_...~mv2.jpg"

  let httpsUrl = `https://static.wixstatic.com/media/${imageId}`;
  if (!httpsUrl.includes("?")) {
    httpsUrl += "?raw=1"; // helps avoid 403
  }

  console.log("[wixToHttps] wix:image →", httpsUrl);
  return httpsUrl;
}

// ----------------------
// 5) Download slab image → base64
// ----------------------
async function downloadImageToBase64(url) {
  console.log("⬇️ Slab image download URL:", url);

  const resp = await fetch(url);
  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    console.error(
      "[downloadImageToBase64] HTTP error:",
      resp.status,
      resp.statusText,
      "Body:",
      bodyText.slice(0, 300)
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
// 6) Gemini 1.5 Flash → IMAGE generation
// ----------------------
async function generateWithGeminiFlash({ prompt, slabBase64, slabMime }) {
  console.log("[GeminiFlash] Prompt:", prompt);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      // tell Gemini we want an image back
      responseMimeType: "image/png",
    },
  });

  const parts = [
    { text: prompt },
  ];

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
  if (!candidate?.content?.parts) {
    console.error("[GeminiFlash] empty candidate:", result);
    throw new Error("Gemini 1.5 Flash returned an empty response.");
  }

  const imagePart = candidate.content.parts.find(
    (p) => p.inlineData && p.inlineData.data
  );

  if (!imagePart) {
    console.error("[GeminiFlash] no inlineData part:", candidate.content.parts);
    throw new Error("Gemini response did not contain an image.");
  }

  const imageBase64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return { imageBase64, mimeType };
}

// ----------------------
// 7) MAIN ENDPOINT: /api/design
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
    // 1) Convert Wix URL → static HTTPS
    const httpsUrl = wixToHttps(slabImageUrl);

    // 2) Download slab → base64
    const { base64: slabBase64, mimeType: slabMime } =
      await downloadImageToBase64(httpsUrl);

    // 3) Enrich prompt with Blue Jeans Marble info
    const enrichedPrompt = (slabLabel
      ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
      : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
    ).trim();

    // 4) Call Gemini (text + slab image → image)
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
      error: err.message || "Gemini isteği sırasında bir hata oluştu.",
    });
  }
});

// ----------------------
// 8) START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans Gemini 1.5 Flash Image Engine listening on port ${PORT}`
  );
});
