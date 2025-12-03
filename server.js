// server.js
const express = require("express");
const cors = require("cors");

// --- CONFIG ---
const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set!");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// Basit root endpoint (bunu az önce gördün)
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine is running 🧠🟦");
});

// ✅ ANA ENDPOINT: /api/design
app.post("/api/design", async (req, res) => {
  try {
    const { prompt, slabImageUrl, slabLabel } = req.body || {};

    if (!prompt || !slabImageUrl) {
      return res.status(400).json({
        ok: false,
        error: "prompt ve slabImageUrl zorunlu.",
      });
    }

    // 1) Slab görselini indir → base64'e çevir
    console.log("⬇️  Downloading slab image:", slabImageUrl);
    const imgResp = await fetch(slabImageUrl);

    if (!imgResp.ok) {
      throw new Error(`Slab image download failed: ${imgResp.status}`);
    }

    const contentType =
      imgResp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imgResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");

    // 2) Gemini'ye gidecek sistem prompt'u
    const systemPrompt = `
You are the **BlueJeans AI Design Engine** for Blue Jeans Marble quarry in Erzurum, Turkey.
You always think as a professional interior designer AND natural stone expert.

- Material: Blue Jeans Marble (exotic dolomitic marble, strong, low absorption).
- Slab label: ${slabLabel || "N/A"}.
- The image is a real polished slab photo from the quarry.
- You must describe how this exact slab could be used in a high-end project
  (kitchen, bathroom, feature wall, floor, spa, lobby etc.), and why its veining,
  colors and structure work for that application.
- Focus on:
  - vein density, direction and movement
  - color balance (blue / bronze / white)
  - bookmatch potential
  - where it is best: island, backsplash, shower, TV wall, fireplace, stairs, etc.
- DO NOT invent a different stone; always talk about this exact slab.
- Output in short, marketing-friendly paragraphs.
`;

    // 3) Gemini isteği gövdesi
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt + "\n\nUser request: " + prompt },
            {
              inlineData: {
                mimeType: contentType,
                data: base64Data,
              },
            },
          ],
        },
      ],
    };

    console.log("🤖 Calling Gemini 2.0 Flash...");
    const geminiResp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const geminiJson = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error("Gemini API error:", geminiJson);
      return res.status(500).json({
        ok: false,
        error: "Gemini API error",
        details: geminiJson,
      });
    }

    // 4) Text çıktısını çek
    const parts =
      geminiJson?.candidates?.[0]?.content?.parts || [];
    const description = parts
      .map((p) => p.text || "")
      .join("")
      .trim();

    return res.json({
      ok: true,
      prompt,
      slabImageUrl,
      slabLabel,
      description,
      geminiRaw: geminiJson, // istersen sonra log için kullanırız
    });
  } catch (err) {
    console.error("❌ /api/design error:", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Internal server error",
    });
  }
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(
    `✅ BlueJeans AI Design Engine running on port ${PORT}`
  );
});
