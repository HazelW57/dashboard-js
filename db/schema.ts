import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const uploads = sqliteTable("uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  objectKey: text("object_key").notNull().unique(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reportLabel: text("report_label").notNull().default(""),
});

export const dashboardState = sqliteTable("dashboard_state", {
  id: integer("id").primaryKey(),
  dashboardJson: text("dashboard_json").notNull(),
  sourceFilename: text("source_filename").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lateReasons = sqliteTable("late_reasons", {
  orderKey: text("order_key").primaryKey(),
  orderNumber: text("order_number").notNull(),
  dashboardType: text("dashboard_type").notNull(),
  reason: text("reason").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const loginAttempts = sqliteTable("login_attempts", {
  identifier: text("identifier").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
