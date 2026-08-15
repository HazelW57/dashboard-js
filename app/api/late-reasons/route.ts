import { NextResponse } from "next/server";
import { LATE_REASON_OPTIONS, orderKey } from "../../lib/dashboard-types";
import { getApiUser, getBindings, initializeStorage } from "../../lib/server-storage";

export async function PATCH(request: Request) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "editor") {
    return NextResponse.json({ error: "This account has view-only access" }, { status: 403 });
  }

  const body = await request.json() as {
    dashboardType?: "DTC" | "B2B";
    orderNumber?: string;
    reason?: string;
    remarks?: string;
    entityName?: string;
    orderDate?: string;
    shippedDate?: string;
    processingDays?: number;
    slaDays?: number | null;
  };
  const dashboardType = body.dashboardType;
  const orderNumber = body.orderNumber?.trim();
  const reason = body.reason?.trim() ?? "";
  const remarks = body.remarks?.trim().slice(0, 500) ?? "";
  const entityName = body.entityName?.trim().slice(0, 160) ?? "";
  const orderDate = body.orderDate?.trim().slice(0, 30) ?? "";
  const shippedDate = body.shippedDate?.trim().slice(0, 30) ?? "";
  const processingDays = Number.isFinite(body.processingDays) ? Number(body.processingDays) : 0;
  const slaDays = body.slaDays == null || !Number.isFinite(body.slaDays) ? null : Number(body.slaDays);
  if (!dashboardType || !["DTC", "B2B"].includes(dashboardType) || !orderNumber) {
    return NextResponse.json({ error: "Order information is required" }, { status: 400 });
  }
  if (reason && !LATE_REASON_OPTIONS.includes(reason as typeof LATE_REASON_OPTIONS[number])) {
    return NextResponse.json({ error: "Invalid late reason" }, { status: 400 });
  }

  const key = orderKey(dashboardType, orderNumber);
  const { DB } = getBindings();
  await initializeStorage(DB);
  await DB.batch([
    DB.prepare(`INSERT INTO late_reasons
      (order_key, order_number, dashboard_type, reason, remarks, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(order_key) DO UPDATE SET
        reason = excluded.reason,
        remarks = excluded.remarks,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(key, orderNumber, dashboardType, reason, remarks, user.username),
    DB.prepare(`INSERT INTO late_reason_history
      (event_key, order_key, order_number, dashboard_type, entity_name, order_date,
       shipped_date, processing_days, sla_days, reason, remarks, updated_by, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(), key, orderNumber, dashboardType, entityName, orderDate,
        shippedDate, processingDays, slaDays, reason, remarks, user.username),
  ]);

  return NextResponse.json({
    edit: { orderKey: key, orderNumber, dashboardType, reason, remarks, updatedBy: user.username },
  });
}
