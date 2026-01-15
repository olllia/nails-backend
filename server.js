const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());
app.use(cors({
  methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH']
}));

const db = new sqlite3.Database("./nails_v6.db");

const ADMIN_ID = 381232429; 
const BOT_TOKEN = "8070453918:AAG-K_RLvFZmLvy6dcZ-jjFsrtNLhG9DiOk";

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    booked INTEGER DEFAULT 0,
    UNIQUE(date, time)
  )`);

  // Добавил поле username в таблицу записей
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER,
    user_id INTEGER,
    user_name TEXT,
    username TEXT, 
    services TEXT,
    total_price INTEGER,
    comment TEXT,
    status TEXT DEFAULT 'active'
  )`);
});

async function sendAdminNotification(msg) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, { chat_id: ADMIN_ID, text: msg, parse_mode: "HTML" });
  } catch (e) { console.error("Ошибка уведомления:", e.message); }
}

// 1. Свободные слоты
app.get("/slots", (req, res) => {
  db.all("SELECT * FROM slots WHERE booked = 0 ORDER BY date, time", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows || []);
  });
});

// 2. Добавление слотов
app.post("/slots/bulk", (req, res) => {
  const { slots } = req.body;
  if (!slots || !Array.isArray(slots)) return res.sendStatus(400);
  const stmt = db.prepare("INSERT OR IGNORE INTO slots (date, time) VALUES (?, ?)");
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    slots.forEach(s => stmt.run(s.date, s.time));
    db.run("COMMIT", (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    });
  });
  stmt.finalize();
});

// 4. Запись (с передачей username)
app.post("/book", (req, res) => {
  const { slotId, userId, userName, username, services, totalPrice, comment } = req.body;
  const servicesString = Array.isArray(services) ? services.join(", ") : services;

  db.run("UPDATE slots SET booked = 1 WHERE id = ? AND booked = 0", [slotId], function(err) {
    if (err || this.changes === 0) return res.status(400).json({ error: "Занято" });

    db.run(
      "INSERT INTO appointments (slot_id, user_id, user_name, username, services, total_price, comment) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [slotId, userId, userName, username, servicesString, totalPrice, comment],
      function(err2) {
        db.get("SELECT date, time FROM slots WHERE id = ?", [slotId], (err3, slot) => {
          const contact = username ? `@${username}` : userName;
          const message = `🔔 <b>Запись к NNAILLSS!</b>\n\n👤 Клиент: ${contact}\n📅 Дата: ${slot.date}\n⏰ Время: ${slot.time}\n💅 Услуги: ${servicesString}\n💰 Сумма: ${totalPrice}₽`;
          sendAdminNotification(message);
        });
        res.json({ success: true });
      }
    );
  });
});

// 5. НОВОЕ: Все записи (для календаря мастера)
// Убрал проверку userId в пути, чтобы фронтенду было проще запрашивать /appointments/all
app.get("/appointments/all", (req, res) => {
  db.all(`
    SELECT a.*, s.date, s.time
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    ORDER BY s.date ASC, s.time ASC
  `, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows || []);
  });
});

// 6. Услуги (Добавил еще для ассортимента)
app.get("/services", (req, res) => {
  res.json([
    { id: 1, name: "Маникюр (обработка)", price: 1200 },
    { id: 2, name: "Покрытие Shellac", price: 1800 },
    { id: 3, name: "Укрепление гелем", price: 500 },
    { id: 4, name: "Дизайн (все ногти)", price: 800 },
    { id: 5, name: "Снятие чужое", price: 300 }
  ]);
});

// Добавь это в конец своего server.js перед app.listen
app.delete("/slots/:id", (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM slots WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend v6 live on ${PORT}`));