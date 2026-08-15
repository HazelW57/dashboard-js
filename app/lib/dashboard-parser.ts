"use client";

import * as XLSX from "xlsx";
import type {
  DashboardData,
  LateOrder,
  PerformanceRow,
  SeriesPoint,
  TrendPoint,
} from "./dashboard-types";

type Row = unknown[];

const asText = (value: unknown) => (value == null ? "" : String(value).trim());
const asNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};
const asNullableNumber = (value: unknown) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function asDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = asText(value);
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function rowsFor(workbook: XLSX.WorkBook, name: string): Row[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Missing required worksheet: ${name}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
}

function findHeader(rows: Row[], headers: string[]) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const text = rows[rowIndex].map(asText);
    const indices = headers.map((header) => text.indexOf(header));
    if (indices.every((index) => index >= 0)) return { rowIndex, indices };
  }
  return null;
}

function readSeries(rows: Row[], firstHeader: string, secondHeader: string): SeriesPoint[] {
  const found = findHeader(rows, [firstHeader, secondHeader]);
  if (!found) return [];
  const [labelCol, valueCol] = found.indices;
  const output: SeriesPoint[] = [];
  for (let index = found.rowIndex + 1; index < rows.length; index += 1) {
    const label = asText(rows[index][labelCol]);
    if (!label) break;
    output.push({ label: label.replaceAll("-", "–"), value: asNumber(rows[index][valueCol]) });
  }
  return output;
}

function readDtcTrend(rows: Row[]): TrendPoint[] {
  const headers = [
    "Week",
    "0-1 Business Day",
    "2 Business Days",
    "3 Business Days",
    "4+ Business Days",
    "0-1 Business Day %",
  ];
  const found = findHeader(rows, headers);
  if (!found) return [];
  const [labelCol, onTimeCol, late1Col, late2Col, late3Col, rateCol] = found.indices;
  return rows.slice(found.rowIndex + 1, found.rowIndex + 5).flatMap((row) => {
    const label = asText(row[labelCol]);
    if (!label) return [];
    const onTime = asNumber(row[onTimeCol]);
    const late1 = asNumber(row[late1Col]);
    const late2 = asNumber(row[late2Col]);
    const late3 = asNumber(row[late3Col]);
    return [{
      label: label.replaceAll("-", "–"),
      total: onTime + late1 + late2 + late3,
      onTime,
      late1,
      late2,
      late3,
      onTimeRate: asNumber(row[rateCol]),
    }];
  });
}

function readB2bTrend(rows: Row[]): TrendPoint[] {
  const headers = [
    "Week",
    "Shipped Orders",
    "On-Time Rate",
    "Within SLA",
    "1-2 Days Late",
    "3-5 Days Late",
    "6+ Days Late",
  ];
  const found = findHeader(rows, headers);
  if (!found) return [];
  const [labelCol, totalCol, rateCol, onTimeCol, late1Col, late2Col, late3Col] = found.indices;
  return rows.slice(found.rowIndex + 1, found.rowIndex + 5).flatMap((row) => {
    const label = asText(row[labelCol]);
    if (!label) return [];
    return [{
      label: label.replaceAll("-", "–"),
      total: asNumber(row[totalCol]),
      onTime: asNumber(row[onTimeCol]),
      late1: asNumber(row[late1Col]),
      late2: asNumber(row[late2Col]),
      late3: asNumber(row[late3Col]),
      onTimeRate: asNumber(row[rateCol]),
    }];
  });
}

function readDtcPerformance(rows: Row[]): PerformanceRow[] {
  const headers = ["Store Name", "Shipped Orders", "On-Time Rate", "Late Orders", "4+ Business Days"];
  const found = findHeader(rows, headers);
  if (!found) return [];
  const [nameCol, shippedCol, rateCol, lateCol, severeCol] = found.indices;
  const output: PerformanceRow[] = [];
  for (const row of rows.slice(found.rowIndex + 1, found.rowIndex + 11)) {
    const name = asText(row[nameCol]);
    if (!name) break;
    output.push({
      name,
      shippedOrders: asNumber(row[shippedCol]),
      onTimeRate: asNumber(row[rateCol]),
      lateOrders: asNumber(row[lateCol]),
      severeLate: asNumber(row[severeCol]),
    });
  }
  return output;
}

function readB2bPerformance(rows: Row[]): PerformanceRow[] {
  const headers = ["Account", "SLA Days", "Shipped Orders", "Units", "On-Time Rate", "Late Orders", "YTD Orders", "YTD On-Time Rate"];
  const found = findHeader(rows, headers);
  if (!found) return [];
  const [nameCol, slaCol, shippedCol, unitsCol, rateCol, lateCol, ytdCol, ytdRateCol] = found.indices;
  const output: PerformanceRow[] = [];
  for (const row of rows.slice(found.rowIndex + 1, found.rowIndex + 11)) {
    const name = asText(row[nameCol]);
    if (!name) break;
    output.push({
      name,
      slaDays: asNullableNumber(row[slaCol]),
      shippedOrders: asNumber(row[shippedCol]),
      units: asNumber(row[unitsCol]),
      onTimeRate: asNullableNumber(row[rateCol]),
      lateOrders: asNullableNumber(row[lateCol]),
      severeLate: asNumber(row[lateCol]),
      ytdOrders: asNumber(row[ytdCol]),
      ytdOnTimeRate: asNullableNumber(row[ytdRateCol]),
    });
  }
  return output;
}

function readLateOrders(rows: Row[], dashboardType: "DTC" | "B2B"): LateOrder[] {
  const found = findHeader(rows, ["Order Number", "Late Reason", "Remarks"]);
  if (!found) return [];
  const header = rows[found.rowIndex].map(asText);
  const col = (name: string) => header.indexOf(name);
  const output: LateOrder[] = [];
  for (const row of rows.slice(found.rowIndex + 1)) {
    const orderNumber = asText(row[col("Order Number")]);
    if (!orderNumber) continue;
    const calendarDays = asNumber(row[col("Calendar Days")]);
    const slaDays = asNumber(row[col("SLA Days")]);
    output.push({
      dashboardType,
      name: asText(row[col(dashboardType === "DTC" ? "Store Name" : "Account")]),
      orderNumber,
      orderDate: asDate(row[col("Order Date")]),
      shippedDate: asDate(row[col("Shipped Date")]),
      businessDays: asNumber(row[col(dashboardType === "DTC" ? "Processing Business Days" : "Calendar Days")]),
      group: dashboardType === "DTC"
        ? asText(row[col("Shipping Time Group")])
        : `${Math.max(0, calendarDays - slaDays)} Days Over SLA`,
      reason: asText(row[col("Late Reason")]),
      remarks: asText(row[col("Remarks")]),
    });
  }
  return output;
}

function findKpiRow(rows: Row[], firstLabel: string) {
  const index = rows.findIndex((row) => row.some((value) => asText(value) === firstLabel));
  if (index < 0 || !rows[index + 1]) throw new Error(`Could not find KPI row: ${firstLabel}`);
  return rows[index + 1];
}

function normalizeReportLabel(value: unknown) {
  const text = asText(value).replace(/^Zepp Health\s*\|\s*/, "");
  return text.replace(": ", " · ").replaceAll("-", "–");
}

export async function parseDashboardWorkbook(file: File): Promise<DashboardData> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const dtcRows = rowsFor(workbook, "DTC Dashboard");
  const b2bRows = rowsFor(workbook, "B2B Dashboard");
  const dtcLateRows = rowsFor(workbook, "DTC Late Orders");
  const b2bLateRows = rowsFor(workbook, "B2B Late Orders");

  const dtcKpis = findKpiRow(dtcRows, "Report Week Shipped Orders");
  const b2bKpis = findKpiRow(b2bRows, "Report Week B2B Orders");
  const dtcGroups = findHeader(dtcRows, ["Shipping Time Group", "Orders", "Share of Week", "Performance Status"]);

  return {
    meta: {
      title: asText(dtcRows[0]?.[0]) || "Shipping Performance Dashboard",
      reportLabel: normalizeReportLabel(dtcRows[1]?.[0]),
      sourceFilename: file.name,
      parsedAt: new Date().toISOString(),
    },
    dtc: {
      kpis: {
        reportWeekOrders: asNumber(dtcKpis[0]),
        onTimeRate: asNumber(dtcKpis[2]),
        lateOrders: asNumber(dtcKpis[4]),
        ytdOrders: asNumber(dtcKpis[6]),
        ytdOnTimeRate: asNumber(dtcKpis[8]),
      },
      shippingGroups: dtcGroups
        ? dtcRows.slice(dtcGroups.rowIndex + 1, dtcGroups.rowIndex + 5).map((row) => ({
            label: asText(row[dtcGroups.indices[0]]).replaceAll("-", "–"),
            orders: asNumber(row[dtcGroups.indices[1]]),
            share: asNumber(row[dtcGroups.indices[2]]),
            status: asText(row[dtcGroups.indices[3]]),
          }))
        : [],
      monthly: readSeries(dtcRows, "Month", "Shipped Orders"),
      weekly: readSeries(dtcRows.slice(10), "Week", "Shipped Orders"),
      trend: readDtcTrend(dtcRows),
      performance: readDtcPerformance(dtcRows),
      lateOrders: readLateOrders(dtcLateRows, "DTC"),
    },
    b2b: {
      kpis: {
        reportWeekOrders: asNumber(b2bKpis[0]),
        reportWeekUnits: asNumber(b2bKpis[2]),
        evaluatedOrders: asNumber(b2bKpis[4]),
        onTimeRate: asNumber(b2bKpis[6]),
        lateOrders: asNumber(b2bKpis[8]),
        ytdOrders: readB2bPerformance(b2bRows).reduce((sum, row) => sum + (row.ytdOrders ?? 0), 0),
        ytdOnTimeRate: 0,
      },
      monthly: readSeries(b2bRows, "Month", "Shipped Orders"),
      weekly: readSeries(b2bRows.slice(8), "Week", "Shipped Orders"),
      trend: readB2bTrend(b2bRows),
      performance: readB2bPerformance(b2bRows),
      lateOrders: readLateOrders(b2bLateRows, "B2B"),
    },
  };
}
