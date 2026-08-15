import { NextResponse } from "next/server";
import type { DashboardData, DashboardSnapshotSummary, ReasonEdit } from "../../lib/dashboard-types";
import { getApiUser, getBindings, initializeStorage } from "../../lib/server-storage";

export const runtime = "nodejs";

type DashboardRow = {
  dashboard_json: string;
  source_filename: string;
  updated_by: string;
  updated_at: string;
};

type SnapshotRow = DashboardRow & {
  snapshot_key: string;
  report_label: string;
};

type ReasonRow = {
  order_key: string;
  order_number: string;
  dashboard_type: "DTC" | "B2B";
  reason: string;
  remarks: string;
  updated_by: string;
  updated_at: string;
};

function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

function readOnly() {
  return NextResponse.json({ error: "This account has view-only access" }, { status: 403 });
}

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  const { DB } = getBindings();
  await initializeStorage(DB);

  const requestedKey = new URL(request.url).searchParams.get("week")?.trim() || "";
  const snapshotsResult = await DB.prepare(`SELECT snapshot_key, report_label,
    source_filename, updated_by, updated_at
    FROM dashboard_snapshots
    ORDER BY updated_at DESC, report_label DESC`).all<Omit<SnapshotRow, "dashboard_json">>();
  const snapshots: DashboardSnapshotSummary[] = (snapshotsResult.results ?? []).map((row) => ({
    key: row.snapshot_key,
    reportLabel: row.report_label,
    sourceFilename: row.source_filename,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
  const selectedSnapshotKey = requestedKey || snapshots[0]?.key || "";
  const state = selectedSnapshotKey
    ? await DB.prepare(`SELECT snapshot_key, report_label, dashboard_json,
        source_filename, updated_by, updated_at
        FROM dashboard_snapshots WHERE snapshot_key = ?`).bind(selectedSnapshotKey).first<SnapshotRow>()
    : await DB.prepare(
        "SELECT dashboard_json, source_filename, updated_by, updated_at FROM dashboard_state WHERE id = 1",
      ).first<DashboardRow>();
  if (requestedKey && !state) {
    return NextResponse.json({ error: "Dashboard week not found" }, { status: 404 });
  }
  const reasons = await DB.prepare(
    "SELECT order_key, order_number, dashboard_type, reason, remarks, updated_by, updated_at FROM late_reasons ORDER BY updated_at DESC",
  ).all<ReasonRow>();

  const reasonEdits: ReasonEdit[] = (reasons.results ?? []).map((row: ReasonRow) => ({
    orderKey: row.order_key,
    orderNumber: row.order_number,
    dashboardType: row.dashboard_type,
    reason: row.reason,
    remarks: row.remarks,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({
    dashboard: state ? JSON.parse(state.dashboard_json) : null,
    snapshots,
    selectedSnapshotKey: state && "snapshot_key" in state ? state.snapshot_key : null,
    reasonEdits,
    source: state
      ? { filename: state.source_filename, updatedBy: state.updated_by, updatedAt: state.updated_at }
      : null,
  });
}

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (user.role !== "editor") return readOnly();
  const { DB, UPLOADS } = getBindings();
  await initializeStorage(DB);

  const form = await request.formData();
  const file = form.get("file");
  const dashboardText = form.get("dashboard");
  if (!(file instanceof File) || typeof dashboardText !== "string") {
    return NextResponse.json({ error: "Workbook and parsed dashboard are required" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Workbook must be 20 MB or smaller" }, { status: 413 });
  }
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    return NextResponse.json({ error: "Please upload an Excel workbook" }, { status: 400 });
  }

  let dashboard: DashboardData;
  try {
    dashboard = JSON.parse(dashboardText) as DashboardData;
  } catch {
    return NextResponse.json({ error: "Dashboard data could not be read" }, { status: 400 });
  }
  if (!dashboard?.meta?.reportLabel || !dashboard?.dtc || !dashboard?.b2b) {
    return NextResponse.json({ error: "Workbook does not match the shipping dashboard format" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const objectKey = `shipping-dashboard/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  await UPLOADS.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    customMetadata: { uploadedBy: user.username, reportLabel: dashboard.meta.reportLabel },
  });

  const payload = JSON.stringify(dashboard);
  const snapshotKey = dashboard.meta.reportLabel.trim().slice(0, 300);
  await DB.batch([
    DB.prepare(
      "INSERT INTO uploads (filename, object_key, uploaded_by, report_label) VALUES (?, ?, ?, ?)",
    ).bind(file.name, objectKey, user.username, dashboard.meta.reportLabel),
    DB.prepare(`INSERT INTO dashboard_state
      (id, dashboard_json, source_filename, updated_by, updated_at)
      VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        dashboard_json = excluded.dashboard_json,
        source_filename = excluded.source_filename,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP`).bind(payload, file.name, user.username),
    DB.prepare(`INSERT INTO dashboard_snapshots
      (snapshot_key, report_label, dashboard_json, source_filename, object_key, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(snapshot_key) DO UPDATE SET
        report_label = excluded.report_label,
        dashboard_json = excluded.dashboard_json,
        source_filename = excluded.source_filename,
        object_key = excluded.object_key,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(snapshotKey, dashboard.meta.reportLabel, payload, file.name, objectKey, user.username),
  ]);

  return NextResponse.json({
    dashboard,
    snapshot: {
      key: snapshotKey,
      reportLabel: dashboard.meta.reportLabel,
      sourceFilename: file.name,
      updatedBy: user.username,
      updatedAt: new Date().toISOString(),
    } satisfies DashboardSnapshotSummary,
    source: { filename: file.name, updatedBy: user.username },
  });
}
