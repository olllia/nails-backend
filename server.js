const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("./database.db");

// ⚠️ ВСТАВЬ TELEGRAM ID МАСТЕРА
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
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER,
      user_id INTEGER,
      user_name TEXT
    )
  `);
});

// --- ПОЛУЧИТЬ СВОБОДНЫЕ ОКОШКИ ---
app.get("/slots", (req, res) => {
  db.all(
    "SELECT * FROM slots WHERE booked = 0 ORDER BY date, time",
    [],
    (err, rows) => {
      res.json(rows);
    }
  );
});

// --- ДОБАВИТЬ ОКОШКО (АДМИН) ---
app.post("/slots", (req, res) => {
  const { date, time, userId } = req.body;
  if (userId !== ADMIN_ID) return res.sendStatus(403);

  db.run(
    "INSERT INTO slots (date, time) VALUES (?, ?)",
    [date, time],
    () => res.sendStatus(200)
  );
});

// --- ЗАПИСАТЬСЯ ---
app.post("/book", (req, res) => {
  const { slotId, userId, userName } = req.body;

  db.run(
    "UPDATE slots SET booked = 1 WHERE id = ?",
    [slotId]
  );

  db.run(
    "INSERT INTO appointments (slot_id, user_id, user_name) VALUES (?, ?, ?)",
    [slotId, userId, userName],
    () => res.sendStatus(200)
  );
});

// --- ПОСМОТРЕТЬ ЗАПИСИ (АДМИН) ---
app.get("/appointments/:userId", (req, res) => {
  if (+req.params.userId !== ADMIN_ID) return res.sendStatus(403);

  db.all(`
    SELECT s.date, s.time, a.user_name
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    ORDER BY s.date, s.time
  `, [], (err, rows) => {
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
