const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Переходим на v5, чтобы структура создалась с нуля без ошибок
const db = new sqlite3.Database("./nails_v5.db");

// --- НАСТРОЙКИ ---
const ADMIN_ID = 381232429; 
const BOT_TOKEN = "8070453918:AAG-K_RLvFZmLvy6dcZ-jjFsrtNLhG9DiOk";

// --- БАЗА ДАННЫХ ---
db.serialize(() => {
  // Таблица слотов с UNIQUE — защита от создания двух одинаковых окошек
  db.run(`CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    booked INTEGER DEFAULT 0,
    UNIQUE(date, time)
  )`);

  // Таблица записей с уже включенными полями услуг и цены
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER,
    user_id INTEGER,
    user_name TEXT,
    services TEXT,
    total_price INTEGER,
    comment TEXT,
    status TEXT DEFAULT 'active'
  )`);
});

// Функция уведомления мастера
async function sendAdminNotification(msg) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, { chat_id: ADMIN_ID, text: msg, parse_mode: "HTML" });
  } catch (e) {
    console.error("Ошибка ТГ уведомления:", e.message);
  }
}

// --- API ЭНДПОИНТЫ ---

// 1. Свободные слоты
app.get("/slots", (req, res) => {
  db.all("SELECT * FROM slots WHERE booked = 0 ORDER BY date, time", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows || []);
  });
});

// 2. Массовое добавление с защитой от дублей
app.post("/slots/bulk", (req, res) => {
  const { slots } = req.body;
  if (!slots || !Array.isArray(slots)) return res.sendStatus(400);

  // INSERT OR IGNORE пропустит те даты/время, которые уже есть в базе
  const stmt = db.prepare("INSERT OR IGNORE INTO slots (date, time) VALUES (?, ?)");
  
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    slots.forEach(s => stmt.run(s.date, s.time));
    db.run("COMMIT", (err) => {
      if (err) return res.status(500).json(err);
      res.json({ success: true, count: slots.length });
    });
  });
  stmt.finalize();
});

// 3. Запись (Бронирование)
app.post("/book", (req, res) => {
  const { slotId, userId, userName, services, totalPrice, comment } = req.body;
  const servicesString = Array.isArray(services) ? services.join(", ") : services;

  db.run(
    "UPDATE slots SET booked = 1 WHERE id = ? AND booked = 0",
    [slotId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(400).json({ error: "Слот уже занят" });

      db.run(
        "INSERT INTO appointments (slot_id, user_id, user_name, services, total_price, comment) VALUES (?, ?, ?, ?, ?, ?)",
        [slotId, userId, userName, servicesString, totalPrice, comment],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          db.get("SELECT date, time FROM slots WHERE id = ?", [slotId], (err3, slot) => {
            const message = `🔔 <b>Новая запись!</b>\n\n👤 Клиент: ${userName}\n📅 Дата: ${slot.date}\n⏰ Время: ${slot.time}\n💅 Услуги: ${servicesString}\n💰 Итого: ${totalPrice}₽\n📝 Коммент: ${comment || '-'}`;
            sendAdminNotification(message);
          });

          res.json({ success: true });
        }
      );
    }
  );
});

// 4. Аналитика для Насти (Выручка и средний чек)
app.get("/stats", (req, res) => {
  db.get(`
    SELECT 
      SUM(total_price) as revenue, 
      COUNT(id) as count,
      AVG(total_price) as avg_check 
    FROM appointments
  `, (err, row) => {
    if (err) return res.status(500).json(err);
    res.json({
      revenue: row.revenue || 0,
      count: row.count || 0,
      avg: Math.round(row.avg_check || 0)
    });
  });
});

// 5. Все записи для админки
app.get("/appointments/:userId", (req, res) => {
  if (parseInt(req.params.userId) !== ADMIN_ID) return res.sendStatus(403);

  db.all(`
    SELECT a.*, s.date, s.time
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    ORDER BY s.date DESC, s.time DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows || []);
  });
});

// 6. Услуги
app.get("/services", (req, res) => {
  res.json([
    { id: 1, name: "Обработка", price: 1000, desc: "Маникюр без покрытия" },
    { id: 2, name: "Комплекс #1", price: 2500, desc: "Маникюр + покрытие" },
    { id: 3, name: "Наращивание", price: 3500, desc: "Средняя длина" }
  ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend v5 live on ${PORT}`));