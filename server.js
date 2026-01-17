const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

const ADMIN_ID = 381232429; 
const BOT_TOKEN = "8070453918:AAG-K_RLvFZmLvy6dcZ-jjFsrtNLhG9DiOk";

// Подключение через переменную, которую ты только что создала в Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Создание таблиц при запуске
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id SERIAL PRIMARY KEY,
        date TEXT,
        time TEXT,
        booked INTEGER DEFAULT 0,
        UNIQUE(date, time)
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        slot_id INTEGER,
        user_id BIGINT,
        user_name TEXT,
        username TEXT, 
        services TEXT,
        total_price INTEGER,
        date TEXT,
        time TEXT,
        comment TEXT
      );
    `);
    console.log("✅ База данных Supabase готова к работе");
  } catch (err) {
    console.error("❌ Ошибка инициализации БД:", err);
  }
};
initDB();

async function sendAdminNotification(msg) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { 
        chat_id: ADMIN_ID, 
        text: msg, 
        parse_mode: "HTML" 
    });
  } catch (e) { console.error("Ошибка Telegram:", e.message); }
}

app.get("/services", (req, res) => {
  res.json([
    { id: 1, name: "Обработка", price: 1000 },
    { id: 2, name: "Комплекс #1", price: 2000 },
    { id: 3, name: "Комплекс #2", price: 2500 },
    { id: 4, name: "Наращивание", price: 3000 },
    { id: 5, name: "Френч / Сложный дизайн", price: 300 },
    { id: 6, name: "Снятие чужое", price: 100 }
  ]);
});

app.get("/slots", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM slots ORDER BY date, time");
    res.json(result.rows);
  } catch (err) { res.status(500).json(err); }
});

app.post("/slots/bulk", async (req, res) => {
  const { slots } = req.body;
  if (!slots || !Array.isArray(slots)) return res.sendStatus(400);
  try {
    for (const s of slots) {
      await pool.query(
        "INSERT INTO slots (date, time) VALUES ($1, $2) ON CONFLICT (date, time) DO NOTHING",
        [s.date, s.time]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json(err); }
});

app.delete("/slots/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM slots WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json(err); }
});

app.post("/book", async (req, res) => {
  const { slotId, userId, userName, username, services, totalPrice, comment } = req.body;
  const servicesString = Array.isArray(services) ? services.join(", ") : services;
  try {
    await pool.query("BEGIN");
    const slotRes = await pool.query("SELECT date, time FROM slots WHERE id = $1 AND booked = 0 FOR UPDATE", [slotId]);
    if (slotRes.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(400).json({ error: "Это время уже занято" });
    }
    const slot = slotRes.rows[0];
    await pool.query(
      "INSERT INTO appointments (slot_id, user_id, user_name, username, services, total_price, date, time, comment) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [slotId, userId, userName, username || '', servicesString, totalPrice, slot.date, slot.time, comment || '']
    );
    await pool.query("UPDATE slots SET booked = 1 WHERE id = $1", [slotId]);
    await pool.query("COMMIT");

    const contact = username ? `<a href="https://t.me/${username}">${userName}</a>` : `<b>${userName}</b>`;
    let message = `🔔 <b>Новая запись!</b>\n\n👤 Клиент: ${contact}\n📅 Дата: ${slot.date}\n⏰ Время: ${slot.time}\n💅 Услуги: ${servicesString}\n`;
    if (comment) message += `💬 Коммент: ${comment}\n`;
    message += `💰 Итог: ${totalPrice}₽`;
    
    sendAdminNotification(message);
    res.json({ success: true });
  } catch (err) {
    await pool.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

app.get("/appointments/:adminId", async (req, res) => {
  if (parseInt(req.params.adminId) !== ADMIN_ID) return res.status(403).json({ error: "Access denied" });
  try {
    const result = await pool.query("SELECT * FROM appointments ORDER BY date ASC, time ASC");
    res.json(result.rows);
  } catch (err) { res.status(500).json(err); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NNAILLSS Backend Live on ${PORT}`));