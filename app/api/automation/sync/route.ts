import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import type { DashboardData, DashboardSnapshotSummary } from "../../../lib/dashboard-types";
import { safeEqual } from "../../../lib/app-auth";
import { getBindings, initializeStorage } from "../../../lib/server-storage";

export const runtime = "nodejs";

type SyncBody = {
  dashboard?: DashboardData;
  rawCsv?: string;
  sourceFilename?: string;
};

function unauthorized() {
  return NextResponse.json({ error: "Invalid automation token" }, { status: 401 });
}

export async function POST(request: Request) {
  const configuredToken = (env as unknown as Record<string, string | undefined>).DASHBOARD_SYNC_TOKEN ?? "";
  const submittedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configuredToken || !submittedToken || !safeEqual(configuredToken, submittedToken)) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 24 * 1024 * 1024) {
    return NextResponse.json({ error: "Sync payload is too large" }, { status: 413 });
  }

  const body = await request.json() as SyncBody;
  const dashboard = body.dashboard;
  const rawCsv = body.rawCsv ?? "";
  const sourceFilename = (body.sourceFilename || dashboard?.meta?.sourceFilename || "shipstation-shipped.csv")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 180);
  if (!dashboard?.meta?.reportLabel || !dashboard.dtc || !dashboard.b2b || !rawCsv) {
    return NextResponse.json({ error: "Dashboard data and shipped CSV are required" }, { status: 400 });
  }

  const { DB, UPLOADS } = getBindings();
  await initializeStorage(DB);
  const objectKey = `shipstation-sync/${Date.now()}-${crypto.randomUUID()}-${sourceFilename}`;
  await UPLOADS.put(objectKey, rawCsv, {
    httpMetadata: { contentType: "text/csv; charset=utf-8" },
    customMetadata: { uploadedBy: "ShipStation API", reportLabel: dashboard.meta.reportLabel },
  });

  const snapshotKey = dashboard.meta.reportLabel.trim().slice(0, 300);
  const payload = JSON.stringify(dashboard);
  await DB.batch([
    DB.prepare(
      "INSERT INTO uploads (filename, object_key, uploaded_by, report_label) VALUES (?, ?, ?, ?)",
    ).bind(sourceFilename, objectKey, "ShipStation API", dashboard.meta.reportLabel),
    DB.prepare(`INSERT INTO dashboard_state
      (id, dashboard_json, source_filename, updated_by, updated_at)
      VALUES (1, ?, ?, 'ShipStation API', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        dashboard_json = excluded.dashboard_json,
        source_filename = excluded.source_filename,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP`).bind(payload, sourceFilename),
    DB.prepare(`INSERT INTO dashboard_snapshots
      (snapshot_key, report_label, dashboard_json, source_filename, object_key, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ShipStation API', CURRENT_TIMESTAMP)
      ON CONFLICT(snapshot_key) DO UPDATE SET
        report_label = excluded.report_label,
        dashboard_json = excluded.dashboard_json,
        source_filename = excluded.source_filename,
        object_key = excluded.object_key,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(snapshotKey, dashboard.meta.reportLabel, payload, sourceFilename, objectKey),
  ]);

  return NextResponse.json({
    ok: true,
    snapshot: {
      key: snapshotKey,
      reportLabel: dashboard.meta.reportLabel,
      sourceFilename,
      updatedBy: "ShipStation API",
      updatedAt: new Date().toISOString(),
    } satisfies DashboardSnapshotSummary,
    shippedRows: rawCsv.split("\n").length - 1,
  });
}
