// server.js  (TEST – resim indirme yok, sadece hattı test ediyoruz)

const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 10000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Basit root endpoint (sağlık kontrolü)
app.get('/', (req, res) => {
  res.send('BlueJeans AI Design Engine is running 🧠🟦 (TEST MODE)');
});

// TEST ENDPOINT: /api/design
app.post('/api/design', async (req, res) => {
  try {
    console.log('✅ /api/design TEST endpoint hit. Body:', req.body);

    const { prompt, slabImageUrl, slabLabel } = req.body || {};

    // Şimdilik sahte / demo bir sonuç döndürüyoruz
    const mockResult = {
      ok: true,
      message: 'TEST DESIGN RESULT (no real image yet)',
      received: {
        prompt,
        slabImageUrl,
        slabLabel,
      },
      demoImageUrl:
        'https://images.pexels.com/photos/3735417/pexels-photo-3735417.jpeg',
    };

    res.json(mockResult);
  } catch (err) {
    console.error('❌ /api/design TEST error:', err);
    res
      .status(500)
      .json({ ok: false, error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(
    `✅ BlueJeans AI Design Engine (TEST) listening on ${PORT}`
  );
});
