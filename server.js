const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("./database.db");

// ⚠️ TELEGRAM ID МАСТЕРА
const ADMIN_ID = 381232429;

// --- БАЗА ДАННЫХ ---
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      time TEXT,
      booked INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER,
      user_id INTEGER,
      user_name TEXT,
      total_price INTEGER,
      services TEXT,
      comment TEXT,
      status TEXT DEFAULT 'active'
    )
  `);
});

// --- GET: свободные слоты ---
app.get("/slots", (req, res) => {
  db.all("SELECT * FROM slots WHERE booked = 0 ORDER BY date, time", [], (err, rows) => {
    res.json(rows);
  });
});

// --- POST: добавить слот (админ) ---
// ⚠️ временно разрешаем все userId
app.post("/slots", (req, res) => {
  const { date, time, userId } = req.body;
  // if (userId !== ADMIN_ID) return res.sendStatus(403); // закомментируем
  db.run("INSERT INTO slots (date, time) VALUES (?, ?)", [date, time], () => res.sendStatus(200));
});


// --- POST: записаться на слот ---
app.post("/book", (req, res) => {
  const { slotId, userId, userName, services, totalPrice, comment } = req.body;

  // блокировка слота: только если booked=0
  db.run(
    "UPDATE slots SET booked = 1 WHERE id = ? AND booked = 0",
    [slotId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(400).json({ error: "Слот уже занят" });

      db.run(
        "INSERT INTO appointments (slot_id, user_id, user_name, services, total_price, comment) VALUES (?, ?, ?, ?, ?, ?)",
        [slotId, userId, userName, JSON.stringify(services), totalPrice, comment],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true, appointmentId: this.lastID });
        }
      );
    }
  );
});

// --- POST: отменить запись ---
app.post("/cancel", (req, res) => {
  const { appointmentId, userId } = req.body;

  db.get("SELECT * FROM appointments WHERE id = ?", [appointmentId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Запись не найдена" });
    if (row.user_id !== userId && userId !== ADMIN_ID) return res.sendStatus(403);

    db.run("UPDATE appointments SET status='cancelled' WHERE id=?", [appointmentId]);
    db.run("UPDATE slots SET booked=0 WHERE id=?", [row.slot_id]);
    res.json({ success: true });
  });
});

// --- POST: перенос записи ---
app.post("/reschedule", (req, res) => {
  const { appointmentId, newSlotId, userId } = req.body;

  db.get("SELECT * FROM appointments WHERE id = ?", [appointmentId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Запись не найдена" });
    if (row.user_id !== userId && userId !== ADMIN_ID) return res.sendStatus(403);

    // проверка нового слота и блокировка
    db.run(
      "UPDATE slots SET booked=1 WHERE id=? AND booked=0",
      [newSlotId],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        if (this.changes === 0) return res.status(400).json({ error: "Новый слот уже занят" });

        // отмена старого слота
        db.run("UPDATE slots SET booked=0 WHERE id=?", [row.slot_id]);
        // обновление записи
        db.run("UPDATE appointments SET slot_id=? WHERE id=?", [newSlotId, appointmentId]);
        res.json({ success: true });
      }
    );
  });
});

// --- GET: все записи (админ) ---
app.get("/appointments/:userId", (req, res) => {
  if (+req.params.userId !== ADMIN_ID) return res.sendStatus(403);

  db.all(`
    SELECT a.id, s.date, s.time, a.user_name, a.services, a.total_price, a.comment, a.status
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    ORDER BY s.date, s.time
  `, [], (err, rows) => {
    res.json(rows);
  });
});

// --- GET: все услуги ---
app.get("/services", (req, res) => {
  db.all("SELECT * FROM services", [], (err, rows) => res.json(rows));
});

// --- POST: добавить услугу (админ) ---
app.post("/services", (req, res) => {
  const { name, price, userId } = req.body;
  if (userId !== ADMIN_ID) return res.sendStatus(403);
  db.run("INSERT INTO services (name, price) VALUES (?, ?)", [name, price], () => res.sendStatus(200));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
