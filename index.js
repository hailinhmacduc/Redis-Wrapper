const express = require('express');
const redis = require('redis');
const axios = require('axios');

const app = express();
const port = 8080;

app.use(express.json());

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD
});

client.on('error', err => console.error('Redis Client Error', err));

// ✅ Chỉ connect một lần duy nhất
(async () => {
  if (!client.isOpen) {
    await client.connect();
    console.log('[🔌 Redis connected]');
  }
})();

let debounceTimeout = null;
const DEBOUNCE_MS = 10000;

app.post('/', async (req, res) => {
  const { id, messages, recipientId } = req.body;

  console.log('[🚀 RECEIVED]', req.body);

  // ✅ Kiểm tra input
  if (!id || !recipientId || !Array.isArray(messages) || messages.length === 0) {
    console.warn('[⚠️ BỎ QUA] Dữ liệu không hợp lệ:', { id, recipientId, messages });
    return res.status(400).json({ success: false, message: 'Thiếu id, recipientId hoặc messages rỗng' });
  }

  try {
    for (const msg of messages) {
      if (typeof msg === 'string' && msg.trim() !== '') {
        await client.rPush(id, msg.trim());
      }
    }

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      console.log('⏱️ Debounce timeout reset');
    }

    debounceTimeout = setTimeout(async () => {
      const allMessages = await client.lRange(id, 0, -1);
      console.log(`[📦 GOM TIN] ${id}`, allMessages);

      await client.del(id);

      try {
        const response = await axios.post(process.env.WEBHOOK_URL, {
          id,
          recipientId,
          messages: allMessages
        });
        console.log('[✅ WEBHOOK GỬI]', response.data);
      } catch (err) {
        console.error('[❌ GỬI WEBHOOK LỖI]', err.message);
      }

      // ❌ KHÔNG gọi client.quit() ở đây → giữ kết nối lâu dài
    }, DEBOUNCE_MS);

    res.json({ success: true, message: 'Debounce started' });

  } catch (err) {
    console.error('[❌ LỖI XỬ LÝ]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Redis wrapper running on port ${port}`);
});
