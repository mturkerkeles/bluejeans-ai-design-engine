// server.js
// BlueJeans AI Design Engine – Imagen 4.0 backend (Render)

// ----------------------
// 1) IMPORTLAR
// ----------------------
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// ----------------------
// 2) ENV KONTROLLERİ
// ----------------------
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    "[FATAL] GEMINI_API_KEY ortam değişkeni tanımlı değil. " +
      "Render Dashboard → Environment → GEMINI_API_KEY olarak eklemelisin."
  );
  process.exit(1);
}

// Google GenAI (Imagen 4.0) client
const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

// ----------------------
// 3) EXPRESS APP
// ----------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Basit health-check
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine (Imagen 4.0) is running 🧠🟦");
});

// ----------------------
// 4) HELPER: Imagen 4 ile görsel üret
// ----------------------
async function generateImagen4Image(prompt) {
  console.log("[Imagen4] Prompt:", prompt);

  // Imagen 4.0 için resmi dokümandan birebir örnek  [oai_citation:1‡Google AI for Developers](https://ai.google.dev/gemini-api/docs/imagen)
  const response = await ai.models.generateImages({
    model: "imagen-4.0-generate-001",
    prompt,
    config: {
      numberOfImages: 1,
      // İstersen burada ayarları genişletiriz:
      // aspectRatio: "4:3",
      // imageSize: "1K",
      // personGeneration: "dont_allow",
    },
  });

  if (
    !response ||
    !response.generatedImages ||
    response.generatedImages.length === 0
  ) {
    throw new Error("Imagen 4 hiçbir görsel döndürmedi.");
  }

  const img = response.generatedImages[0];
  if (!img.image || !img.image.imageBytes) {
    throw new Error("Imagen 4 cevabında imageBytes bulunamadı.");
  }

  const base64 = img.image.imageBytes; // Zaten base64 string
  return {
    imageBase64: base64,
    mimeType: "image/png", // Imagen PNG üretiyor, istersen ayarlarız
  };
}

// ----------------------
// 5) ANA ENDPOINT: /generate
// ----------------------
app.post("/generate", async (req, res) => {
  const { prompt, slabImageUrl, slabLabel } = req.body || {};

  console.log("[/generate] Request body:", {
    prompt,
    slabImageUrl,
    slabLabel,
  });

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({
      ok: false,
      error: "Prompt boş olamaz.",
    });
  }

  try {
    // 🔵 Şu an Imagen 4 Node.js API'si yalnızca text prompt destekliyor.
    // slabImageUrl'i ileride referans-image desteği geldiğinde kullanacağız.
    // Şimdilik prompt'un içine slab bilgisi ekleyip modelin "Blue Jeans Marble slab" ruhunu taşımasını sağlarız.
    const enrichedPrompt = slabLabel
      ? `${prompt}\n\nMaterial: premium Blue Jeans Marble ${slabLabel}, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`
      : `${prompt}\n\nMaterial: premium Blue Jeans Marble, dramatic denim-blue veining with bronze accents, ultra realistic interior rendering, 4K quality.`;

    const { imageBase64, mimeType } = await generateImagen4Image(enrichedPrompt);

    return res.json({
      ok: true,
      imageBase64,
      mimeType,
      usedModel: "imagen-4.0-generate-001",
      received: {
        prompt,
        slabImageUrl,
        slabLabel,
      },
    });
  } catch (err) {
    console.error("[/generate] ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: err.message || "Imagen 4 isteği sırasında beklenmeyen bir hata oluştu.",
    });
  }
});

// ----------------------
// 6) SERVER’I BAŞLAT
// ----------------------
app.listen(PORT, () => {
  console.log(`BlueJeans AI Design Engine (Imagen 4.0) listening on port ${PORT}`);
});
