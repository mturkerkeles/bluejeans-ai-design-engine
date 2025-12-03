// server.js — TEST MODE (gerçek AI yok, sadece demo image döner)

const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 10000;

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// Basit root test
app.get("/", (req, res) => {
  res.send("BlueJeans AI Design Engine is running 🧠🟦 (TEST MODE)");
});

// Test endpoint
app.post("/api/design", async (req, res) => {
  try {

    const { prompt, slabImageUrl, slabLabel } = req.body || {};

    console.log("🟦 /api/design TEST endpoint hit. Body:", req.body);

    // Bu DEMO GÖRSEL → sabit bir mutfak fotoğrafı
    const demoImageUrl =
      "https://images.pexels.com/photos/3735417/pexels-photo-3735417.jpeg";

    return res.json({
      ok: true,
      demoImageUrl,         // 🔥 FRONTEND mutlaka bunu yakalayacak
      imageUrl: null,       // gerçek render yok
      imageBase64: null,    
      mimeType: "image/jpeg",

      received: {
        prompt,
        slabImageUrl,
        slabLabel,
      },

      message: "TEST DESIGN RESULT (no real image yet)",
    });

  } catch (err) {
    console.error("❌ TEST MODE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`🟦 BlueJeans AI Design Engine (TEST) listening on ${PORT}`);
});
