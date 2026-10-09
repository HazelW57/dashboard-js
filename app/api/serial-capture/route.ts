import { NextResponse } from "next/server";
import { getApiUser, getBindings } from "../../lib/server-storage";
import type { SerialBulkScanRow, SerialImportRow } from "../../lib/serial-types";

type OrderRow = {
  order_key: string;
  order_number: string;
  po_number: string;
  customer_name: string;
  status: string;
  source: string;
  order_date: string;
  expected_units: number;
  scanned_units: number;
  sku_count: number;
  updated_at: string;
};

type LineRow = {
  id: number;
  order_key: string;
  sku: string;
  upc: string;
  description: string;
  ordered_qty: number;
  case_pack: number;
  scanned_qty: number;
};

type ScanRow = {
  id: number;
  scan_key: string;
  order_key: string;
  sku: string;
  serial_number: string | null;
  carton_number: string | null;
  scan_type: "serial" | "carton";
  unit_quantity: number;
  scanned_by: string;
  scanned_at: string;
  voided: number;
};

const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const orderKey = (value: unknown) => clean(value, 100).toUpperCase();
const positiveInt = (value: unknown, fallback = 1) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

function editorOnly() {
  return NextResponse.json({ error: "This account has view-only access" }, { status: 403 });
}

function mapOrder(row: OrderRow) {
  return {
    orderKey: row.order_key,
    orderNumber: row.order_number,
    poNumber: row.po_number,
    customerName: row.customer_name,
    status: row.status,
    source: row.source,
    orderDate: row.order_date,
    expectedUnits: Number(row.expected_units || 0),
    scannedUnits: Number(row.scanned_units || 0),
    skuCount: Number(row.sku_count || 0),
    updatedAt: row.updated_at,
  };
}

function mapScan(row: ScanRow) {
  return {
    id: row.id,
    scanKey: row.scan_key,
    orderKey: row.order_key,
    sku: row.sku,
    serialNumber: row.serial_number ?? "",
    cartonNumber: row.carton_number ?? "",
    scanType: row.scan_type,
    unitQuantity: Number(row.unit_quantity || 0),
    scannedBy: row.scanned_by,
    scannedAt: row.scanned_at,
    voided: Boolean(row.voided),
  };
}

const orderListSql = `SELECT o.order_key, o.order_number, o.po_number, o.customer_name,
  o.status, o.source, o.order_date, o.updated_at,
  COALESCE(SUM(l.ordered_qty), 0) AS expected_units,
  COUNT(l.id) AS sku_count,
  COALESCE((SELECT SUM(s.unit_quantity) FROM serial_scans s
    WHERE s.order_key = o.order_key AND s.voided = 0), 0) AS scanned_units
  FROM serial_orders o
  LEFT JOIN serial_order_lines l ON l.order_key = o.order_key
  GROUP BY o.order_key
  ORDER BY CASE WHEN o.status = 'open' THEN 0 ELSE 1 END, o.updated_at DESC, o.order_number DESC`;

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  const { DB } = getBindings();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "orders";
  const selectedOrderKey = orderKey(url.searchParams.get("orderKey"));

  if (mode === "lookup") {
    const query = clean(url.searchParams.get("q"), 160);
    if (query.length < 2) return NextResponse.json({ results: [] });
    const like = `%${query.replaceAll("%", "").replaceAll("_", "")}%`;
    const rows = await DB.prepare(`SELECT id, scan_key, order_key, sku, serial_number,
      carton_number, scan_type, unit_quantity, scanned_by, scanned_at, voided
      FROM serial_scans
      WHERE serial_number LIKE ? OR carton_number LIKE ? OR sku LIKE ? OR order_key LIKE ?
      ORDER BY scanned_at DESC LIMIT 200`).bind(like, like, like, like).all<ScanRow>();
    return NextResponse.json({ results: (rows.results ?? []).map(mapScan) });
  }

  if (mode === "audit") {
    const rows = await DB.prepare(`SELECT id, order_key, action, subject, details_json, actor, created_at
      FROM serial_audit_log ORDER BY created_at DESC, id DESC LIMIT 300`).all<{
        id: number; order_key: string; action: string; subject: string;
        details_json: string; actor: string; created_at: string;
      }>();
    return NextResponse.json({ audits: (rows.results ?? []).map((row) => ({
      id: row.id,
      orderKey: row.order_key,
      action: row.action,
      subject: row.subject,
      details: JSON.parse(row.details_json || "{}") as Record<string, unknown>,
      actor: row.actor,
      createdAt: row.created_at,
    })) });
  }

  if (selectedOrderKey) {
    const order = await DB.prepare(orderListSql.replace("ORDER BY CASE WHEN o.status = 'open' THEN 0 ELSE 1 END, o.updated_at DESC, o.order_number DESC", "HAVING o.order_key = ?"))
      .bind(selectedOrderKey).first<OrderRow>();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const [lineRows, scanRows] = await Promise.all([
      DB.prepare(`SELECT l.id, l.order_key, l.sku, l.upc, l.description, l.ordered_qty, l.case_pack,
        COALESCE((SELECT SUM(s.unit_quantity) FROM serial_scans s
          WHERE s.order_key = l.order_key AND s.sku = l.sku AND s.voided = 0), 0) AS scanned_qty
        FROM serial_order_lines l WHERE l.order_key = ? ORDER BY l.sku`).bind(selectedOrderKey).all<LineRow>(),
      DB.prepare(`SELECT id, scan_key, order_key, sku, serial_number, carton_number, scan_type,
        unit_quantity, scanned_by, scanned_at, voided FROM serial_scans
        WHERE order_key = ? ORDER BY scanned_at DESC, id DESC LIMIT 500`).bind(selectedOrderKey).all<ScanRow>(),
    ]);
    return NextResponse.json({
      order: mapOrder(order),
      lines: (lineRows.results ?? []).map((row) => ({
        id: row.id, orderKey: row.order_key, sku: row.sku, upc: row.upc,
        description: row.description, orderedQty: Number(row.ordered_qty || 0),
        casePack: Number(row.case_pack || 1), scannedQty: Number(row.scanned_qty || 0),
      })),
      scans: (scanRows.results ?? []).map(mapScan),
    });
  }

  const rows = await DB.prepare(orderListSql).all<OrderRow>();
  const orders = (rows.results ?? []).map(mapOrder);
  return NextResponse.json({
    orders,
    summary: {
      openOrders: orders.filter((order) => order.status === "open").length,
      expectedUnits: orders.reduce((sum, order) => sum + order.expectedUnits, 0),
      scannedUnits: orders.reduce((sum, order) => sum + order.scannedUnits, 0),
      completedOrders: orders.filter((order) => order.expectedUnits > 0 && order.scannedUnits >= order.expectedUnits).length,
    },
  });
}

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (user.role !== "editor") return editorOnly();
  const body = await request.json() as Record<string, unknown>;
  const action = clean(body.action, 40);
  const { DB } = getBindings();

  if (action === "importOrders") {
    const rows = Array.isArray(body.rows) ? body.rows as SerialImportRow[] : [];
    if (!rows.length || rows.length > 5000) {
      return NextResponse.json({ error: "Import between 1 and 5,000 order lines" }, { status: 400 });
    }
    const orders = new Map<string, {
      orderNumber: string; poNumber: string; customerName: string; status: string;
      source: string; orderDate: string; lines: Map<string, SerialImportRow>;
    }>();
    for (const row of rows) {
      const key = orderKey(row.orderNumber);
      const sku = clean(row.sku, 120).toUpperCase();
      if (!key || !sku) return NextResponse.json({ error: "Every row needs an Order Number and SKU" }, { status: 400 });
      const quantity = positiveInt(row.orderedQty, 0);
      if (!quantity) return NextResponse.json({ error: `Ordered Qty must be greater than zero for ${key} / ${sku}` }, { status: 400 });
      const current = orders.get(key) ?? {
        orderNumber: clean(row.orderNumber, 100),
        poNumber: clean(row.poNumber, 100),
        customerName: clean(row.customerName, 180),
        status: clean(row.status, 40).toLowerCase() || "open",
        source: clean(row.source, 60) || "workbook",
        orderDate: clean(row.orderDate, 30),
        lines: new Map<string, SerialImportRow>(),
      };
      const existing = current.lines.get(sku);
      current.lines.set(sku, {
        ...row,
        sku,
        orderedQty: quantity + (existing?.orderedQty ?? 0),
        casePack: positiveInt(row.casePack, 1),
      });
      orders.set(key, current);
    }
    const statements: D1PreparedStatement[] = [];
    for (const [key, order] of orders) {
      statements.push(DB.prepare(`INSERT INTO serial_orders
        (order_key, order_number, po_number, customer_name, status, source, order_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(order_key) DO UPDATE SET po_number = excluded.po_number,
          customer_name = excluded.customer_name, status = excluded.status, source = excluded.source,
          order_date = excluded.order_date, updated_at = CURRENT_TIMESTAMP`)
        .bind(key, order.orderNumber, order.poNumber, order.customerName, order.status, order.source, order.orderDate, user.username));
      for (const line of order.lines.values()) {
        statements.push(DB.prepare(`INSERT INTO serial_order_lines
          (order_key, sku, upc, description, ordered_qty, case_pack, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(order_key, sku) DO UPDATE SET upc = excluded.upc,
            description = excluded.description, ordered_qty = excluded.ordered_qty,
            case_pack = excluded.case_pack, updated_at = CURRENT_TIMESTAMP`)
          .bind(key, clean(line.sku, 120).toUpperCase(), clean(line.upc, 80), clean(line.description, 300),
            positiveInt(line.orderedQty), positiveInt(line.casePack)));
      }
    }
    for (let offset = 0; offset < statements.length; offset += 60) await DB.batch(statements.slice(offset, offset + 60));
    await DB.prepare(`INSERT INTO serial_audit_log
      (order_key, action, subject, details_json, actor, created_at)
      VALUES ('', 'orders_imported', ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(`${orders.size} orders`, JSON.stringify({ orders: orders.size, lines: rows.length }), user.username).run();
    return NextResponse.json({ importedOrders: orders.size, importedLines: rows.length });
  }

  if (action === "scan") {
    const key = orderKey(body.orderKey);
    const sku = clean(body.sku, 120).toUpperCase();
    const scanType = body.scanType === "carton" ? "carton" : "serial";
    const value = clean(body.value, 240);
    if (!key || !sku || !value) return NextResponse.json({ error: "Order, SKU, and scan value are required" }, { status: 400 });
    const line = await DB.prepare(`SELECT ordered_qty, case_pack FROM serial_order_lines
      WHERE order_key = ? AND sku = ?`).bind(key, sku).first<{ ordered_qty: number; case_pack: number }>();
    if (!line) return NextResponse.json({ error: "SKU is not on the selected order" }, { status: 400 });
    const unitQuantity = scanType === "carton" ? positiveInt(body.unitQuantity, line.case_pack || 1) : 1;
    const duplicate = await DB.prepare(`SELECT id, voided FROM serial_scans WHERE order_key = ? AND
      ((? = 'serial' AND serial_number = ?) OR (? = 'carton' AND carton_number = ?))`)
      .bind(key, scanType, value, scanType, value).first<{ id: number; voided: number }>();
    if (duplicate && !duplicate.voided) return NextResponse.json({ error: "This value was already scanned on the selected order" }, { status: 409 });
    const subject = scanType === "carton" ? `Carton ${value}` : `Serial ${value}`;
    if (duplicate?.voided) {
      await DB.batch([
        DB.prepare(`UPDATE serial_scans SET voided = 0, voided_by = NULL, voided_at = NULL,
          sku = ?, unit_quantity = ?, scanned_by = ?, scanned_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(sku, unitQuantity, user.username, duplicate.id),
        DB.prepare(`INSERT INTO serial_audit_log (order_key, action, subject, details_json, actor, created_at)
          VALUES (?, 'scan_restored', ?, ?, ?, CURRENT_TIMESTAMP)`)
          .bind(key, subject, JSON.stringify({ sku, scanType, unitQuantity }), user.username),
      ]);
    } else {
      await DB.batch([
        DB.prepare(`INSERT INTO serial_scans
          (scan_key, order_key, sku, serial_number, carton_number, scan_type, unit_quantity, scanned_by, scanned_at, voided)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)`)
          .bind(crypto.randomUUID(), key, sku, scanType === "serial" ? value : null,
            scanType === "carton" ? value : null, scanType, unitQuantity, user.username),
        DB.prepare(`INSERT INTO serial_audit_log (order_key, action, subject, details_json, actor, created_at)
          VALUES (?, 'scan_added', ?, ?, ?, CURRENT_TIMESTAMP)`)
          .bind(key, subject, JSON.stringify({ sku, scanType, unitQuantity }), user.username),
      ]);
    }
    return NextResponse.json({ success: true, subject, unitQuantity });
  }

  if (action === "bulkScan") {
    const rows = Array.isArray(body.rows) ? body.rows as SerialBulkScanRow[] : [];
    if (!rows.length || rows.length > 1000) {
      return NextResponse.json({ error: "Upload between 1 and 1,000 scan rows at a time" }, { status: 400 });
    }
    const lineRows = await DB.prepare("SELECT order_key, sku, case_pack FROM serial_order_lines").all<{ order_key: string; sku: string; case_pack: number }>();
    const lines = new Map((lineRows.results ?? []).map((row) => [`${row.order_key}::${row.sku}`, row]));
    const prepared: Array<{ statement: D1PreparedStatement; label: string }> = [];
    const errors: string[] = [];
    rows.forEach((row, index) => {
      const key = orderKey(row.orderNumber);
      const sku = clean(row.sku, 120).toUpperCase();
      const line = lines.get(`${key}::${sku}`);
      if (!line) {
        errors.push(`Row ${index + 2}: order/SKU was not found`);
        return;
      }
      const scanType = row.scanType === "carton" || row.cartonNumber ? "carton" : "serial";
      const value = clean(scanType === "carton" ? row.cartonNumber : row.serialNumber, 240);
      if (!value) {
        errors.push(`Row ${index + 2}: scan value is blank`);
        return;
      }
      const unitQuantity = scanType === "carton" ? positiveInt(row.unitQuantity, line.case_pack || 1) : 1;
      prepared.push({
        statement: DB.prepare(`INSERT OR IGNORE INTO serial_scans
          (scan_key, order_key, sku, serial_number, carton_number, scan_type, unit_quantity, scanned_by, scanned_at, voided)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)`)
          .bind(crypto.randomUUID(), key, sku, scanType === "serial" ? value : null,
            scanType === "carton" ? value : null, scanType, unitQuantity, user.username),
        label: `${key} / ${value}`,
      });
    });
    let imported = 0;
    for (let offset = 0; offset < prepared.length; offset += 60) {
      const batch = prepared.slice(offset, offset + 60);
      const results = await DB.batch(batch.map((item) => item.statement));
      results.forEach((result, index) => {
        if (Number(result.meta?.changes ?? 0) > 0) imported += 1;
        else errors.push(`${batch[index].label}: duplicate on this order`);
      });
    }
    await DB.prepare(`INSERT INTO serial_audit_log
      (order_key, action, subject, details_json, actor, created_at)
      VALUES ('', 'bulk_scans_imported', ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(`${imported} scans`, JSON.stringify({ imported, rejected: errors.length }), user.username).run();
    return NextResponse.json({ imported, rejected: errors.length, errors: errors.slice(0, 100) });
  }

  if (action === "voidScan") {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Valid scan ID required" }, { status: 400 });
    const scan = await DB.prepare(`SELECT id, order_key, serial_number, carton_number FROM serial_scans
      WHERE id = ? AND voided = 0`).bind(id).first<{ id: number; order_key: string; serial_number: string | null; carton_number: string | null }>();
    if (!scan) return NextResponse.json({ error: "Active scan not found" }, { status: 404 });
    const subject = scan.serial_number || scan.carton_number || String(id);
    await DB.batch([
      DB.prepare(`UPDATE serial_scans SET voided = 1, voided_by = ?, voided_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(user.username, id),
      DB.prepare(`INSERT INTO serial_audit_log (order_key, action, subject, details_json, actor, created_at)
        VALUES (?, 'scan_voided', ?, '{}', ?, CURRENT_TIMESTAMP)`)
        .bind(scan.order_key, subject, user.username),
    ]);
    return NextResponse.json({ success: true });
  }

  if (action === "setOrderStatus") {
    const key = orderKey(body.orderKey);
    const status = clean(body.status, 40).toLowerCase();
    if (!key || !["open", "completed", "hold"].includes(status)) {
      return NextResponse.json({ error: "Order status must be Open, Completed, or Hold" }, { status: 400 });
    }
    await DB.batch([
      DB.prepare("UPDATE serial_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_key = ?").bind(status, key),
      DB.prepare(`INSERT INTO serial_audit_log (order_key, action, subject, details_json, actor, created_at)
        VALUES (?, 'order_status_changed', ?, ?, ?, CURRENT_TIMESTAMP)`)
        .bind(key, status, JSON.stringify({ status }), user.username),
    ]);
    return NextResponse.json({ success: true, status });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
