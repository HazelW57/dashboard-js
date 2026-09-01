import { NextResponse } from "next/server";
import { defaultJsFaultForReason, LATE_REASON_OPTIONS, orderKey } from "../../lib/dashboard-types";
import { getApiUser, getBindings, initializeStorage } from "../../lib/server-storage";

type EditInput = {
  dashboardType?: "DTC" | "B2B";
  orderNumber?: string;
  reason?: string;
  remarks?: string;
  confirmedNotLate?: boolean;
  jsFault?: boolean;
  reportKey?: string;
  reportLabel?: string;
  entityName?: string;
  orderDate?: string;
  shippedDate?: string;
  processingDays?: number;
  slaDays?: number | null;
};

type NormalizedEdit = {
  key: string;
  orderNumber: string;
  dashboardType: "DTC" | "B2B";
  reason: string;
  remarks: string;
  confirmedNotLate: boolean;
  jsFault: boolean;
  reportKey: string;
  reportLabel: string;
  entityName: string;
  orderDate: string;
  shippedDate: string;
  processingDays: number;
  slaDays: number | null;
};

function normalizeEdit(body: EditInput): NormalizedEdit | { error: string } {
  const dashboardType = body.dashboardType;
  const orderNumber = body.orderNumber?.trim();
  const reason = body.reason?.trim() ?? "";
  if (!dashboardType || !["DTC", "B2B"].includes(dashboardType) || !orderNumber) {
    return { error: "Order information is required" };
  }
  if (reason && !LATE_REASON_OPTIONS.includes(reason as typeof LATE_REASON_OPTIONS[number])) {
    return { error: "Invalid late reason" };
  }
  const confirmedNotLate = body.confirmedNotLate === true;
  const jsFault = confirmedNotLate
    ? false
    : typeof body.jsFault === "boolean" ? body.jsFault : defaultJsFaultForReason(reason);
  return {
    key: orderKey(dashboardType, orderNumber),
    orderNumber,
    dashboardType,
    reason,
    remarks: body.remarks?.trim().slice(0, 500) ?? "",
    confirmedNotLate,
    jsFault,
    reportKey: body.reportKey?.trim().slice(0, 300) ?? "",
    reportLabel: body.reportLabel?.trim().slice(0, 300) ?? "",
    entityName: body.entityName?.trim().slice(0, 160) ?? "",
    orderDate: body.orderDate?.trim().slice(0, 30) ?? "",
    shippedDate: body.shippedDate?.trim().slice(0, 30) ?? "",
    processingDays: Number.isFinite(body.processingDays) ? Number(body.processingDays) : 0,
    slaDays: body.slaDays == null || !Number.isFinite(body.slaDays) ? null : Number(body.slaDays),
  };
}

async function saveEdits(request: Request, bulk: boolean) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (user.role !== "editor") {
    return NextResponse.json({ error: "This account has view-only access" }, { status: 403 });
  }

  const payload = await request.json() as EditInput | { edits?: EditInput[] };
  const inputs = bulk ? ("edits" in payload ? payload.edits ?? [] : []) : [payload as EditInput];
  if (!inputs.length || inputs.length > 500) {
    return NextResponse.json({ error: "Between 1 and 500 edits are required" }, { status: 400 });
  }
  const edits: NormalizedEdit[] = [];
  for (const input of inputs) {
    const edit = normalizeEdit(input);
    if ("error" in edit) return NextResponse.json({ error: edit.error }, { status: 400 });
    edits.push(edit);
  }

  const { DB } = getBindings();
  await initializeStorage(DB);
  for (let offset = 0; offset < edits.length; offset += 40) {
    const statements: D1PreparedStatement[] = [];
    for (const edit of edits.slice(offset, offset + 40)) {
      statements.push(
        DB.prepare(`INSERT INTO late_reasons
          (order_key, order_number, dashboard_type, reason, remarks, confirmed_not_late, js_fault, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(order_key) DO UPDATE SET
            reason = excluded.reason,
            remarks = excluded.remarks,
            confirmed_not_late = excluded.confirmed_not_late,
            js_fault = excluded.js_fault,
            updated_by = excluded.updated_by,
            updated_at = CURRENT_TIMESTAMP`)
          .bind(edit.key, edit.orderNumber, edit.dashboardType, edit.reason, edit.remarks,
            Number(edit.confirmedNotLate), Number(edit.jsFault), user.username),
        DB.prepare(`INSERT INTO late_reason_history
          (event_key, order_key, order_number, dashboard_type, report_key, report_label, entity_name, order_date,
           shipped_date, processing_days, sla_days, reason, remarks, confirmed_not_late, js_fault, updated_by, saved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
          .bind(crypto.randomUUID(), edit.key, edit.orderNumber, edit.dashboardType, edit.reportKey, edit.reportLabel,
            edit.entityName, edit.orderDate, edit.shippedDate, edit.processingDays, edit.slaDays, edit.reason,
            edit.remarks, Number(edit.confirmedNotLate), Number(edit.jsFault), user.username),
      );
    }
    await DB.batch(statements);
  }

  const saved = edits.map((edit) => ({
    orderKey: edit.key,
    orderNumber: edit.orderNumber,
    dashboardType: edit.dashboardType,
    reason: edit.reason,
    remarks: edit.remarks,
    confirmedNotLate: edit.confirmedNotLate,
    jsFault: edit.jsFault,
    updatedBy: user.username,
  }));
  return NextResponse.json(bulk ? { edits: saved } : { edit: saved[0] });
}

export async function PATCH(request: Request) {
  return saveEdits(request, false);
}

export async function POST(request: Request) {
  return saveEdits(request, true);
}
