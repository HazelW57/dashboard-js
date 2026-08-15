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

export type ReasonEdit = {
  orderKey: string;
  orderNumber: string;
  dashboardType: "DTC" | "B2B";
  reason: string;
  remarks: string;
  updatedBy?: string;
  updatedAt?: string;
};

export function orderKey(type: "DTC" | "B2B", orderNumber: string) {
  return `${type}:${orderNumber}`;
}
