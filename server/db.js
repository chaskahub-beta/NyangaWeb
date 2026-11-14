"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_SETTINGS = {
  // 0 = dimanche … 6 = samedi. Fermé le week-end par défaut.
  openingHours: {
    0: [],
    1: [["09:30", "18:30"]],
    2: [["09:30", "18:30"]],
    3: [["09:30", "18:30"]],
    4: [["09:30", "18:30"]],
    5: [["09:30", "18:30"]],
    6: []
  },
  slotStep: 30,   // minutes entre deux débuts possibles
  bufferMinutes: 15 // pause entre deux clientes
};

function openDb(dbPath) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'fr',
      mode TEXT NOT NULL CHECK (mode IN ('me','gift')),
      date TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      services_json TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      deposit_cents INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      gift_name TEXT,
      gift_age INTEGER,
      gift_email TEXT,
      gift_message TEXT,
      status TEXT NOT NULL,
      hold_expires_at TEXT,
      checkout_id TEXT,
      payment_status TEXT,
      paid_at TEXT,
      gift_code TEXT UNIQUE,
      gift_redeemed_at TEXT,
      balance_paid_at TEXT,
      needs_attention INTEGER NOT NULL DEFAULT 0,
      admin_note TEXT,
      emails_sent_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
    CREATE INDEX IF NOT EXISTS idx_bookings_checkout ON bookings(checkout_id);

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start TEXT,
      end TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blocks_date ON blocks(date);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

function getSettings(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'main'").get();
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(row.value) };
}

function saveSettings(db, settings) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(settings));
}

/** Ejecuta fn dentro de una transacción (síncrona). */
function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { openDb, getSettings, saveSettings, tx, DEFAULT_SETTINGS };
