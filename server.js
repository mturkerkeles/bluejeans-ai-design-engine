// server.js (TEST – resim indirme yok, sadece boru hattını test ediyoruz)
const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 10000;

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// Basit root endpoint
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine is running 🧠🟦 (TEST MODE)");
});

// 🧪 TEST ENDPOINT: /api/design
app.post("/api/design", async (req, res) => {
  try {
    console.log("✅ /api/design TEST endpoint hit. Body:", req.body);

    const { prompt, slabImageUrl, slabLabel } = req.body || {};

    if (!prompt || !slabImageUrl) {
      return res.status(400).json({
        ok: false,
        reason: "Missing prompt or slabImageUrl",
      });
    }

    // 🔴 ÖNEMLİ: Burada fetch ile resmi İNDİRMİYORUZ.
    // Sadece gelen URL'i ve prompt'u geri döndüren sahte bir cevap var.
    const fakeResult = {
      ok: true,
      promptUsed: prompt,
      slabLabel: slabLabel || "unknown",
      designSummary:
        "TEST MODE: Gemini ve resim işleme kapalı, sadece boru hattını doğruluyoruz.",
      suggestedUse:
        "Bu cevabı Wix tarafında görebiliyorsan, Wix → Backend → Render hattı çalışıyor demektir.",
      echoImageUrl: slabImageUrl,
    };

    return res.status(200).json(fakeResult);
  } catch (err) {
    console.error("❌ /api/design TEST error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal test error",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ BlueJeans AI Design Engine (TEST) listening on ${PORT}`);
});
