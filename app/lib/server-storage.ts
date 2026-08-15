import { env } from "cloudflare:workers";
import { getAppSession, type AppSessionUser } from "./app-auth";

type Bindings = {
  DB: D1Database;
  UPLOADS: R2Bucket;
};

export function getBindings() {
  return env as unknown as Bindings;
}

export async function getApiUser(): Promise<AppSessionUser | null> {
  return getAppSession();
}

export async function initializeStorage(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      report_label TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dashboard_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      dashboard_json TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS late_reasons (
      order_key TEXT PRIMARY KEY,
      order_number TEXT NOT NULL,
      dashboard_type TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
      identifier TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_late_reasons_type
      ON late_reasons(dashboard_type, updated_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at
      ON uploads(uploaded_at)`),
  ]);
  await db.prepare("PRAGMA optimize").run();
}
