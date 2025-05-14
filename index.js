// index.js
const express = require('express');
const redis = require('redis');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const port = 8080;

app.use(bodyParser.json());

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    connectTimeout: 10000
  },
  password: process.env.REDIS_PASSWORD,
  database: 0
});

client.on('error', (err) => console.error('Redis Client Error:', err));

const debounceMap = new Map();
const DEBOUNCE_MS = 3000;

async function processMessages(key, recipientId) {
  try {
    const messages = await client.lRange(key, 0, -1);
    if (messages.length === 0) return;

    await client.del(key);
    console.log(`Deleted list ${key} after processing.`);

    const webhookUrl = process.env.WEBHOOK_URL;
    const payload = {
      id: key,
      recipientId,
      messages
    };

    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('✅ Sent to webhook. Status:', response.status);
  } catch (err) {
    console.error('❌ Error processing messages:', err.message);
  }
}

app.post('/', async (req, res) => {
  const { id, recipientId, messages } = req.body;
  if (!id || !recipientId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  await client.connect();

  for (const msg of messages) {
    await client.rPush(id, msg);
    console.log(`📩 Added to Redis list [${id}]:`, msg);
  }

  if (debounceMap.has(id)) clearTimeout(debounceMap.get(id));

  const timeout = setTimeout(() => {
    processMessages(id, recipientId);
    debounceMap.delete(id);
  }, DEBOUNCE_MS);

  debounceMap.set(id, timeout);
  res.json({ success: true, message: 'Debounce started' });
});

app.listen(port, () => {
  console.log(`Redis wrapper running on port ${port}`);
});
