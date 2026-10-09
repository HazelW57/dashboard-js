import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const dashboardSnapshots = sqliteTable("dashboard_snapshots", {
  snapshotKey: text("snapshot_key").primaryKey(),
  reportLabel: text("report_label").notNull(),
  dashboardJson: text("dashboard_json").notNull(),
  sourceFilename: text("source_filename").notNull(),
  objectKey: text("object_key").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_dashboard_snapshots_updated_at").on(table.updatedAt),
]);

export const lateReasons = sqliteTable("late_reasons", {
  orderKey: text("order_key").primaryKey(),
  orderNumber: text("order_number").notNull(),
  dashboardType: text("dashboard_type").notNull(),
  reason: text("reason").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  confirmedNotLate: integer("confirmed_not_late", { mode: "boolean" }).notNull().default(false),
  jsFault: integer("js_fault", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lateReasonHistory = sqliteTable("late_reason_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventKey: text("event_key").notNull(),
  orderKey: text("order_key").notNull(),
  orderNumber: text("order_number").notNull(),
  dashboardType: text("dashboard_type").notNull(),
  reportKey: text("report_key").notNull().default(""),
  reportLabel: text("report_label").notNull().default(""),
  entityName: text("entity_name").notNull().default(""),
  orderDate: text("order_date").notNull().default(""),
  shippedDate: text("shipped_date").notNull().default(""),
  processingDays: integer("processing_days").notNull().default(0),
  slaDays: integer("sla_days"),
  reason: text("reason").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  confirmedNotLate: integer("confirmed_not_late", { mode: "boolean" }).notNull().default(false),
  jsFault: integer("js_fault", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").notNull(),
  savedAt: text("saved_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("late_reason_history_event_key_unique").on(table.eventKey),
  index("idx_late_reason_history_type_saved").on(table.dashboardType, table.savedAt),
]);

export const loginAttempts = sqliteTable("login_attempts", {
  identifier: text("identifier").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const serialOrders = sqliteTable("serial_orders", {
  orderKey: text("order_key").primaryKey(),
  orderNumber: text("order_number").notNull(),
  poNumber: text("po_number").notNull().default(""),
  customerName: text("customer_name").notNull().default(""),
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("manual"),
  orderDate: text("order_date").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("serial_orders_order_number_unique").on(table.orderNumber),
  index("idx_serial_orders_updated_at").on(table.updatedAt),
]);

export const serialOrderLines = sqliteTable("serial_order_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderKey: text("order_key").notNull(),
  sku: text("sku").notNull(),
  upc: text("upc").notNull().default(""),
  description: text("description").notNull().default(""),
  orderedQty: integer("ordered_qty").notNull().default(0),
  casePack: integer("case_pack").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("serial_order_lines_order_sku_unique").on(table.orderKey, table.sku),
  index("idx_serial_order_lines_upc").on(table.upc),
]);

export const serialScans = sqliteTable("serial_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scanKey: text("scan_key").notNull().unique(),
  orderKey: text("order_key").notNull(),
  sku: text("sku").notNull(),
  serialNumber: text("serial_number"),
  cartonNumber: text("carton_number"),
  scanType: text("scan_type").notNull().default("serial"),
  unitQuantity: integer("unit_quantity").notNull().default(1),
  scannedBy: text("scanned_by").notNull(),
  scannedAt: text("scanned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  voided: integer("voided", { mode: "boolean" }).notNull().default(false),
  voidedBy: text("voided_by"),
  voidedAt: text("voided_at"),
}, (table) => [
  uniqueIndex("serial_scans_order_serial_unique").on(table.orderKey, table.serialNumber),
  uniqueIndex("serial_scans_order_carton_unique").on(table.orderKey, table.cartonNumber),
  index("idx_serial_scans_order_sku").on(table.orderKey, table.sku),
  index("idx_serial_scans_serial").on(table.serialNumber),
  index("idx_serial_scans_carton").on(table.cartonNumber),
  index("idx_serial_scans_scanned_at").on(table.scannedAt),
]);

export const serialAuditLog = sqliteTable("serial_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderKey: text("order_key").notNull().default(""),
  action: text("action").notNull(),
  subject: text("subject").notNull().default(""),
  detailsJson: text("details_json").notNull().default("{}"),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_serial_audit_order_created").on(table.orderKey, table.createdAt),
  index("idx_serial_audit_created_at").on(table.createdAt),
]);
