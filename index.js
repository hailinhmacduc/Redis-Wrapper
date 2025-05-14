const express = require('express');
const redis = require('redis');
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

let debounceTimeout = null;
const DEBOUNCE_MS = 10000;

app.post('/', async (req, res) => {
  const { id, messages, recipientId } = req.body;

  console.log('[🚀 RECEIVED]', req.body); // 👈 Log toàn bộ request body

  await client.connect();

  // Push từng tin nhắn vào Redis list
  for (const msg of messages) {
    await client.rPush(id, msg);
  }

  // Clear và set debounce lại
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    console.log('⏱️ Debounce timeout reset');
  }

  debounceTimeout = setTimeout(async () => {
    const allMessages = await client.lRange(id, 0, -1);
    console.log(`[📦 GOM TIN] ${id}`, allMessages);

    await client.del(id);

    // Gửi toàn bộ tin nhắn gom được sang webhook AI
    const axios = require('axios');
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

    await client.quit();
  }, DEBOUNCE_MS);

  res.json({ success: true, message: 'Debounce started' });
});

app.listen(port, () => {
  console.log(`Redis wrapper running on port ${port}`);
});
