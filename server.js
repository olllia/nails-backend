const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

// Используем твою базу v6, чтобы сохранить преемственность
const db = new sqlite3.Database("./nails_v6.db");

const ADMIN_ID = 381232429; 
const BOT_TOKEN = "8070453918:AAG-K_RLvFZmLvy6dcZ-jjFsrtNLhG9DiOk";

db.serialize(() => {
  // Слоты
  db.run(`CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    booked INTEGER DEFAULT 0,
    UNIQUE(date, time)
  )`);

  // Записи
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER,
    user_id INTEGER,
    user_name TEXT,
    username TEXT, 
    services TEXT,
    total_price INTEGER,
    date TEXT,
    time TEXT
  )`);
});

// Уведомление в Telegram (с защитой от спецсимволов)
async function sendAdminNotification(msg) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, { 
        chat_id: ADMIN_ID, 
        text: msg, 
        parse_mode: "HTML" 
    });
  } catch (e) { 
    console.error("Ошибка уведомления:", e.response?.data || e.message); 
  }
}

// 1. Получить услуги СТРОГО по новому прайсу
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

// 2. Все слоты (для фронта)
app.get("/slots", (req, res) => {
  db.all("SELECT * FROM slots ORDER BY date, time", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows || []);
  });
});

// 3. Массовое добавление слотов
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

// 4. Удаление слота
app.delete("/slots/:id", (req, res) => {
  db.run("DELETE FROM slots WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
  });
});

// 5. Запись (Booking)
app.post("/book", (req, res) => {
  const { slotId, userId, userName, username, services, totalPrice } = req.body;
  const servicesString = Array.isArray(services) ? services.join(", ") : services;

  db.get("SELECT date, time FROM slots WHERE id = ? AND booked = 0", [slotId], (err, slot) => {
    if (err || !slot) return res.status(400).json({ error: "Это время уже занято" });

    db.run(
      "INSERT INTO appointments (slot_id, user_id, user_name, username, services, total_price, date, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [slotId, userId, userName, username || '', servicesString, totalPrice, slot.date, slot.time],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        db.run("UPDATE slots SET booked = 1 WHERE id = ?", [slotId]);

        const contact = username ? `@${username}` : userName;
        const message = `🔔 <b>Новая запись!</b>\n\n👤 Клиент: ${contact}\n📅 Дата: ${slot.date}\n⏰ Время: ${slot.time}\n💅 Услуги: ${servicesString}\n💰 Итог: ${totalPrice}₽`;
        
        sendAdminNotification(message);
        res.json({ success: true });
      }
    );
  });
});

// 6. Получить все записи (для вкладки Управление)
app.get("/appointments/:adminId", (req, res) => {
  // Возвращаем все записи из таблицы appointments
  db.all("SELECT * FROM appointments ORDER BY date ASC, time ASC", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows || []);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NNAILLSS Backend Live on ${PORT}`));