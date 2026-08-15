export const LATE_REASON_OPTIONS = [
  "Out of Stock",
  "Address issue",
  "Carrier pickup delay",
  "System issue",
  "Customer request",
  "Warehouse capacity",
  "Pre-Order",
  "Other",
] as const;

export const CONFIRMED_B2B_SLA_DAYS: Record<string, number> = {
  amazon: 7,
  rei: 7,
};

export function confirmedB2bSlaDays(account: string, workbookValue?: number | null) {
  return CONFIRMED_B2B_SLA_DAYS[account.trim().toLowerCase()] ?? workbookValue ?? null;
}

export type Kpis = {
  reportWeekOrders: number;
  onTimeRate: number;
  lateOrders: number;
  ytdOrders: number;
  ytdOnTimeRate: number;
  reportWeekUnits?: number;
  evaluatedOrders?: number;
};

export type SeriesPoint = { label: string; value: number };

export type TrendPoint = {
  label: string;
  total: number;
  onTime: number;
  late1: number;
  late2: number;
  late3: number;
  onTimeRate: number;
};

export type PerformanceRow = {
  name: string;
  shippedOrders: number;
  onTimeRate: number | null;
  lateOrders: number | null;
  severeLate: number;
  units?: number;
  slaDays?: number | null;
  ytdOrders?: number;
  ytdOnTimeRate?: number | null;
};

export type LateOrder = {
  dashboardType: "DTC" | "B2B";
  name: string;
  orderNumber: string;
  orderDate: string;
  shippedDate: string;
  businessDays: number;
  calendarDays?: number;
  slaDays?: number | null;
  group: string;
  reason: string;
  remarks: string;
};

export type DashboardSection = {
  kpis: Kpis;
  monthly: SeriesPoint[];
  weekly: SeriesPoint[];
  trend: TrendPoint[];
  performance: PerformanceRow[];
  lateOrders: LateOrder[];
};

export type DashboardData = {
  meta: {
    title: string;
    reportLabel: string;
    sourceFilename: string;
    parsedAt: string;
  };
  dtc: DashboardSection & {
    shippingGroups: Array<{
      label: string;
      orders: number;
      share: number;
      status: string;
    }>;
  };
  b2b: DashboardSection;
};

export type DashboardSnapshotSummary = {
  key: string;
  reportLabel: string;
  sourceFilename: string;
  updatedBy: string;
  updatedAt: string;
};

export type ReasonEdit = {
  orderKey: string;
  orderNumber: string;
  dashboardType: "DTC" | "B2B";
  reason: string;
  remarks: string;
  reportKey?: string;
  reportLabel?: string;
  entityName?: string;
  orderDate?: string;
  shippedDate?: string;
  processingDays?: number;
  slaDays?: number | null;
  updatedBy?: string;
  updatedAt?: string;
};

export function orderKey(type: "DTC" | "B2B", orderNumber: string) {
  return `${type}:${orderNumber}`;
}
