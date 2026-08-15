import { NextResponse } from "next/server";
import type { DashboardData, LateOrder } from "../../../lib/dashboard-types";
import { orderKey } from "../../../lib/dashboard-types";
import { getApiUser, getBindings, initializeStorage } from "../../../lib/server-storage";

type CurrentRow = {
  order_key: string;
  order_number: string;
  dashboard_type: "DTC" | "B2B";
  reason: string;
  remarks: string;
  updated_by: string;
  updated_at: string;
};

type HistoryRow = CurrentRow & {
  id: number;
  event_key: string;
  entity_name: string;
  order_date: string;
  shipped_date: string;
  processing_days: number;
  sla_days: number | null;
  saved_at: string;
};

type DashboardRow = { dashboard_json: string };

function detailMap(dashboard: DashboardData | null) {
  const map = new Map<string, LateOrder>();
  if (!dashboard) return map;
  for (const order of [...dashboard.dtc.lateOrders, ...dashboard.b2b.lateOrders]) {
    map.set(orderKey(order.dashboardType, order.orderNumber), order);
  }
  return map;
}

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { DB } = getBindings();
  await initializeStorage(DB);
  const [currentResult, historyResult, dashboardRow] = await Promise.all([
    DB.prepare(`SELECT order_key, order_number, dashboard_type, reason, remarks,
      updated_by, updated_at FROM late_reasons ORDER BY updated_at DESC`).all<CurrentRow>(),
    DB.prepare(`SELECT id, event_key, order_key, order_number, dashboard_type,
      entity_name, order_date, shipped_date, processing_days, sla_days,
      reason, remarks, updated_by, saved_at
      FROM late_reason_history ORDER BY saved_at DESC, id DESC`).all<HistoryRow>(),
    DB.prepare("SELECT dashboard_json FROM dashboard_state WHERE id = 1").first<DashboardRow>(),
  ]);

  let dashboard: DashboardData | null = null;
  try {
    dashboard = dashboardRow ? JSON.parse(dashboardRow.dashboard_json) as DashboardData : null;
  } catch {
    dashboard = null;
  }
  const details = detailMap(dashboard);
  const withDetail = (row: CurrentRow | HistoryRow) => {
    const order = details.get(row.order_key);
    const history = "entity_name" in row ? row : null;
    return {
      dashboardType: row.dashboard_type,
      entityName: history?.entity_name || order?.name || "",
      orderNumber: row.order_number,
      orderDate: history?.order_date || order?.orderDate || "",
      shippedDate: history?.shipped_date || order?.shippedDate || "",
      processingDays: history?.processing_days || order?.businessDays || 0,
      slaDays: history?.sla_days ?? order?.slaDays ?? null,
      reason: row.reason,
      remarks: row.remarks,
      updatedBy: row.updated_by,
      savedAt: "saved_at" in row ? row.saved_at : row.updated_at,
    };
  };

  return NextResponse.json({
    current: (currentResult.results ?? []).map(withDetail),
    history: (historyResult.results ?? []).map(withDetail),
  });
}
