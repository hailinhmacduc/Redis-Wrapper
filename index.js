const express = require("express");
const { createClient } = require("redis");
const axios = require("axios");

const app = express();
app.use(express.json());

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  },
  password: process.env.REDIS_PASSWORD,
});

const DEBOUNCE_MS = 5000;
const debounceTimers = {};

app.post("/debounce", async (req, res) => {
  const { senderId, recipientId, message } = req.body;

  if (!senderId || !message || !recipientId) {
    return res.status(400).json({ error: "Missing fields" });
  }

  await client.connect();
  await client.rPush(senderId, message);
  await client.disconnect();

  if (debounceTimers[senderId]) clearTimeout(debounceTimers[senderId]);

  debounceTimers[senderId] = setTimeout(async () => {
    await client.connect();
    const messages = await client.lRange(senderId, 0, -1);
    await client.del(senderId);
    await client.disconnect();

    const payload = {
      id: senderId,
      recipientId,
      messages,
    };

    try {
      const response = await axios.post(process.env.WEBHOOK_URL, payload);
      console.log("AI response:", response.data);
    } catch (err) {
      console.error("Webhook error:", err.message);
    }
  }, DEBOUNCE_MS);

  return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Redis wrapper running on port", PORT));
