// server.js
// BlueJeans AI Engine – Nano Banana (Gemini 2.5 Flash Image) + image edit

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();

// Render'ın verdiği PORT veya 10000
const PORT = process.env.PORT || 10000;

// --- Gemini (Nano Banana) ayarları ---

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Nano Banana modeli: gemini-2.5-flash-image-preview
// (istersen bunu env ile geçebilirsin)
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

if (!GEMINI_API_KEY) {
  console.warn(
    '⚠️  GEMINI_API_KEY tanımlı değil. /api/design çağrıları hata dönecek.'
  );
}

const genAI = GEMINI_API_KEY
  ? new GoogleGenerativeAI(GEMINI_API_KEY)
  : null;

// --- Express middleware ---

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// --- Helper: Wix image URL -> https URL ---

function wixImageToHttpUrl(wixUrl) {
  // Örnek:
  // wix:image://v1/2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg/blue-jeans-slab_lot-802.jpg#originWidth=1600&originHeight=1200
  //
  // Biz sadece media-id kısmını çekiyoruz: 2e3f8a_008affd73da44d5c918dd3fe197c04b7~mv2.jpg
  try {
    const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
    if (!match) return null;
    const mediaId = match[1];
    return `https://static.wixstatic.com/media/${mediaId}`;
  } catch (e) {
    console.error('wixImageToHttpUrl parse error:', e);
    return null;
  }
}

// --- Helper: remote image -> base64 ---

async function downloadImageAsBase64(imageUrl) {
  console.log('🧲 Downloading slab image from:', imageUrl);

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(
      `Image download failed: HTTP ${res.status} ${res.statusText}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
}

// --- Root endpoint (health check) ---

app.get('/', (req, res) => {
  res.send('BlueJeans AI Engine (Nano Banana) is running 🧠🟦');
});

// --- Ana endpoint: /api/design ---

app.post('/api/design', async (req, res) => {
  const { prompt, slabImageUrl, slabLabel } = req.body || {};

  console.log('📩 /api/design called with:', {
    prompt,
    slabImageUrl,
    slabLabel,
  });

  if (!GEMINI_API_KEY || !genAI) {
    console.error('❌ GEMINI_API_KEY eksik');
    return res.status(500).json({
      ok: false,
      error: 'GEMINI_API_KEY is not set on the server.',
    });
  }

  if (!prompt || !slabImageUrl) {
    console.error('❌ prompt veya slabImageUrl eksik');
    return res.status(400).json({
      ok: false,
      error: 'prompt and slabImageUrl are required.',
    });
  }

  try {
    // 1) Wix URL → HTTP URL
    const httpUrl = wixImageToHttpUrl(slabImageUrl);
    if (!httpUrl) {
      throw new Error(`Could not parse wix image url: ${slabImageUrl}`);
    }

    // 2) Görseli indir ve base64'e çevir
    const slabBase64 = await downloadImageAsBase64(httpUrl);

    // 3) Gemini 2.5 Flash Image (Nano Banana) ile text + image → image
    console.log('🎨 Sending request to Gemini (Nano Banana)...');

    const imageModel = genAI.getGenerativeModel({
      model: GEMINI_IMAGE_MODEL,
    });

    // Gemini Node client'ında image gönderimi: inlineData
    const imagePart = {
      inlineData: {
        data: slabBase64,
        mimeType: 'image/jpeg',
      },
    };

    // İçerik: önce prompt, sonra referans slab resmi
    const result = await imageModel.generateContent([prompt, imagePart]);

    // `result.response` içinden inlineData olan part'ı bulalım
    const apiResponse = await result.response;
    const candidates = apiResponse.candidates || [];
    let imageBase64 = null;
    let mimeType = 'image/png';

    if (candidates.length > 0) {
      const parts = candidates[0].content?.parts || [];
      for (const p of parts) {
        if (p.inlineData && p.inlineData.data) {
          imageBase64 = p.inlineData.data;
          if (p.inlineData.mimeType) {
            mimeType = p.inlineData.mimeType;
          }
          break;
        }
      }
    }

    if (!imageBase64) {
      console.error(
        '❌ Gemini returned no inline image data. Full response:',
        JSON.stringify(apiResponse, null, 2)
      );
      return res.status(500).json({
        ok: false,
        error: 'Model call succeeded but no image was returned.',
        raw: apiResponse,
      });
    }

    console.log('✅ Gemini image generated successfully.');

    // 4) Frontend'e gönderilecek yanıt
    return res.json({
      ok: true,
      imageBase64,
      mimeType,
      received: {
        prompt,
        slabImageUrl,
        slabLabel,
        httpUrl,
      },
    });
  } catch (err) {
    console.error('/api/design ERROR:', err);

    // Gemini client özel hatası
    if (err.name === 'GoogleGenerativeAIError') {
      return res.status(500).json({
        ok: false,
        error: `Gemini API error: ${err.message}`,
      });
    }

    return res.status(500).json({
      ok: false,
      error: err.message || 'Unknown server error',
    });
  }
});

// --- Sunucu başlat ---

app.listen(PORT, () => {
  console.log(
    `🚀 BlueJeans AI Engine listening on port ${PORT} (Nano Banana image+text)`
  );
});
