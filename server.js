const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios"); // Добавил для уведомлений в ТГ

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("./database.db");

// --- НАСТРОЙКИ ---
const ADMIN_ID = 381232429; 
const BOT_TOKEN = "8070453918:AAG-K_RLvFZmLvy6dcZ-jjFsrtNLhG9DiOk"; // Вставь сюда токен от BotFather

// --- БАЗА ДАННЫХ ---
db.serialize(() => {
  // Слоты
  db.run(`CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    booked INTEGER DEFAULT 0
  )`);

  // Записи (с проверкой на существование колонки services)
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER,
    user_id INTEGER,
    user_name TEXT,
    total_price INTEGER,
    services TEXT,
    comment TEXT,
    status TEXT DEFAULT 'active'
  )`, (err) => {
    if (!err) {
      // Если таблица уже была, принудительно пробуем добавить колонку services
      // SQLite проигнорирует это, если колонка уже есть
      db.run(`ALTER TABLE appointments ADD COLUMN services TEXT`, (alterErr) => {
        if (alterErr) console.log("Колонка services уже существует или ошибка");
      });
    }
  });
});

// Функция отправки уведомления мастеру
async function sendAdminNotification(msg) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, { chat_id: ADMIN_ID, text: msg, parse_mode: "HTML" });
  } catch (e) {
    console.error("Ошибка отправки уведомления в ТГ:", e.message);
  }
}

// --- API ЭНДПОИНТЫ ---

// 1. Получить свободные слоты
app.get("/slots", (req, res) => {
  db.all("SELECT * FROM slots WHERE booked = 0 ORDER BY date, time", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

// 2. Добавить слот (Админ)
app.post("/slots", (req, res) => {
  const { date, time } = req.body;
  db.run("INSERT INTO slots (date, time) VALUES (?, ?)", [date, time], function(err) {
    if (err) return res.status(500).json(err);
    res.json({ id: this.lastID });
  });
});

// 3. ЗАПИСАТЬСЯ (Главная логика)
app.post("/book", (req, res) => {
  const { slotId, userId, userName, services, totalPrice, comment } = req.body;
  const servicesString = Array.isArray(services) ? services.join(", ") : services;

  // 1. Пытаемся забронировать слот
  db.run(
    "UPDATE slots SET booked = 1 WHERE id = ? AND booked = 0",
    [slotId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(400).json({ error: "Слот уже занят" });

      // 2. Если слот наш, создаем запись
      db.run(
        "INSERT INTO appointments (slot_id, user_id, user_name, services, total_price, comment) VALUES (?, ?, ?, ?, ?, ?)",
        [slotId, userId, userName, servicesString, totalPrice, comment],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          // 3. Получаем инфо о времени для уведомления
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

// 4. Получить все записи (для админки)
app.get("/appointments/:userId", (req, res) => {
  // Пока оставляем проверку по ID, как у тебя было
  if (parseInt(req.params.userId) !== ADMIN_ID) return res.sendStatus(403);

  db.all(`
    SELECT a.id, s.date, s.time, a.user_name, a.services, a.total_price, a.comment, a.status
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    ORDER BY s.date DESC, s.time DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

// 5. Услуги (хардкод или база)
app.get("/services", (req, res) => {
  res.json([
    { id: 1, name: "Обработка", price: 1000, desc: "Маникюр без покрытия" },
    { id: 2, name: "Комплекс #1", price: 2000, desc: "Маникюр + покрытие + дизайн" },
    { id: 3, name: "Наращивание", price: 3000, desc: "Средняя длина" }
  ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));