"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  ListFilter,
  LogOut,
  PackageCheck,
  RefreshCw,
  Save,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDashboardWorkbook } from "../lib/dashboard-parser";
import {
  confirmedB2bSlaDays,
  defaultJsFaultForReason,
  LATE_REASON_OPTIONS,
  orderKey,
  type DashboardData,
  type DashboardSnapshotSummary,
  type LateOrder,
  type ReasonEdit,
} from "../lib/dashboard-types";
import { sampleDashboard } from "../lib/sample-dashboard";
import type { AppRole } from "../lib/app-auth";
import type { SerialSection } from "../lib/serial-types";
import { SerialCapture } from "./serial-capture";

type View = "DTC" | "B2B" | "LATE" | "SERIAL";
type LateSheet = "DTC" | "B2B";

const numberFormat = new Intl.NumberFormat("en-US");
const pct = (value: number | null | undefined) => value == null ? "Pending" : `${(value * 100).toFixed(1)}%`;
const formatDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const shippedDateNewestFirst = (left: LateOrder, right: LateOrder) => {
  const leftTime = Date.parse(left.shippedDate);
  const rightTime = Date.parse(right.shippedDate);
  const shippedDateDifference = (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  if (shippedDateDifference) return shippedDateDifference;
  const orderDateDifference = (right.orderDate || "").localeCompare(left.orderDate || "");
  return orderDateDifference || left.orderNumber.localeCompare(right.orderNumber);
};

function reportDateRange(label: string) {
  const match = label.match(/([A-Z][a-z]{2}) (\d{1,2})[–-]([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
  if (!match) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startMonth = months.indexOf(match[1]);
  const endMonth = months.indexOf(match[3]);
  if (startMonth < 0 || endMonth < 0) return null;
  const endYear = Number(match[5]);
  const startYear = startMonth > endMonth ? endYear - 1 : endYear;
  const toIso = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  return { start: toIso(startYear, startMonth, Number(match[2])), end: toIso(endYear, endMonth, Number(match[4])) };
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.name}><span style={{ background: item.color }} />{item.name}: {item.name.includes("Rate") ? pct(item.value) : numberFormat.format(item.value)}</div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, tone, detail }: { label: string; value: string; tone: "blue" | "green" | "red" | "teal" | "gold"; detail?: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top"><span>{label}</span><i /></div>
      <strong>{value}</strong>
      <small>{detail ?? "Current reporting period"}</small>
    </article>
  );
}

function EmptyLateOrders({ canUpload, onUpload }: { canUpload: boolean; onUpload: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><FileSpreadsheet size={24} /></div>
      <h3>Upload a live workbook to review orders</h3>
      <p>{canUpload ? "The sample view excludes order-level details. Your uploaded workbook stays behind the private login." : "No order-level details are available in the current workbook."}</p>
      {canUpload && <button className="btn-primary" onClick={onUpload}><Upload size={16} /> Upload Excel</button>}
    </div>
  );
}

export function DashboardApp({ user, signOutHref }: { user: { name: string; username: string; role: AppRole }; signOutHref: string }) {
  const canEdit = user.role === "editor";
  const [view, setView] = useState<View>("DTC");
  const [serialSection, setSerialSection] = useState<SerialSection>("orders");
  const [serialMenuOpen, setSerialMenuOpen] = useState(true);
  const [lateSheet, setLateSheet] = useState<LateSheet>("DTC");
  const [dashboard, setDashboard] = useState<DashboardData>(sampleDashboard);
  const [snapshots, setSnapshots] = useState<DashboardSnapshotSummary[]>([]);
  const [selectedSnapshotKey, setSelectedSnapshotKey] = useState("");
  const [reasonEdits, setReasonEdits] = useState<Record<string, ReasonEdit>>({});
  const [dirtyReasonKeys, setDirtyReasonKeys] = useState<Set<string>>(() => new Set());
  const [unfilledOnly, setUnfilledOnly] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");
  const [selectedLateOrderKeys, setSelectedLateOrderKeys] = useState<Set<string>>(() => new Set());
  const [selectedLateReason, setSelectedLateReason] = useState("");
  const [selectedActualStatus, setSelectedActualStatus] = useState<"" | "system-late" | "confirmed-not-late">("");
  const [selectedAccountability, setSelectedAccountability] = useState<"" | "warehouse-fault" | "not-warehouse-fault">("");
  const [selectedUpdateOpen, setSelectedUpdateOpen] = useState(false);
  const [selectedUpdateSaving, setSelectedUpdateSaving] = useState(false);
  const [selectedUpdateError, setSelectedUpdateError] = useState("");
  const [selectedUpdateSuccess, setSelectedUpdateSuccess] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bulkFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        if (!active) return;
        if (payload.dashboard) setDashboard(payload.dashboard);
        setSnapshots(payload.snapshots ?? []);
        setSelectedSnapshotKey(payload.selectedSnapshotKey ?? payload.snapshots?.[0]?.key ?? "");
        const edits: Record<string, ReasonEdit> = {};
        for (const edit of payload.reasonEdits ?? []) edits[edit.orderKey] = edit;
        setReasonEdits(edits);
        setDirtyReasonKeys(new Set());
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  async function selectSnapshot(snapshotKey: string) {
    if (!snapshotKey || snapshotKey === selectedSnapshotKey) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?week=${encodeURIComponent(snapshotKey)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Dashboard week could not be loaded");
      if (payload.dashboard) setDashboard(payload.dashboard);
      setSnapshots(payload.snapshots ?? []);
      setSelectedSnapshotKey(payload.selectedSnapshotKey ?? snapshotKey);
      const edits: Record<string, ReasonEdit> = {};
      for (const edit of payload.reasonEdits ?? []) edits[edit.orderKey] = edit;
      setReasonEdits(edits);
      setDirtyReasonKeys(new Set());
      setSelectedLateOrderKeys(new Set());
    } finally {
      setLoading(false);
    }
  }

  const dtcLate = dashboard.dtc.lateOrders;
  const b2bLate = dashboard.b2b.lateOrders;
  const allLateOrders = useMemo(() => [...dtcLate, ...b2bLate].map((order) => {
    const edit = reasonEdits[orderKey(order.dashboardType, order.orderNumber)];
    return edit
      ? { ...order, reason: edit.reason, remarks: edit.remarks, confirmedNotLate: edit.confirmedNotLate, jsFault: edit.jsFault }
      : { ...order, confirmedNotLate: false, jsFault: defaultJsFaultForReason(order.reason) };
  }), [dtcLate, b2bLate, reasonEdits]);

  const dtcSheetOrders = useMemo(() => allLateOrders.filter((order) => order.dashboardType === "DTC").sort(shippedDateNewestFirst), [allLateOrders]);
  const b2bSheetOrders = useMemo(() => allLateOrders.filter((order) => order.dashboardType === "B2B").sort(shippedDateNewestFirst), [allLateOrders]);
  const dtcActualLateOrders = useMemo(() => dtcSheetOrders.filter((order) => !order.confirmedNotLate), [dtcSheetOrders]);
  const b2bActualLateOrders = useMemo(() => b2bSheetOrders.filter((order) => !order.confirmedNotLate), [b2bSheetOrders]);
  const allOpenLateOrders = useMemo(() => [...dtcSheetOrders, ...b2bSheetOrders]
    .filter((order) => !order.confirmedNotLate && !order.reason.trim())
    .sort(shippedDateNewestFirst), [dtcSheetOrders, b2bSheetOrders]);
  const visibleLateOrders = view === "B2B" ? b2bActualLateOrders : dtcActualLateOrders;
  const activeLateSheetOrders = lateSheet === "DTC" ? dtcSheetOrders : b2bSheetOrders;
  const activeActualLateOrders = activeLateSheetOrders.filter((order) => !order.confirmedNotLate);
  const openLateOrderCount = activeActualLateOrders.filter((order) => !order.reason.trim()).length;
  const filteredLateSheetOrders = useMemo(() => {
    if (!unfilledOnly) return activeLateSheetOrders;
    return activeLateSheetOrders.filter((order) =>
      (!order.confirmedNotLate && !order.reason.trim()) || dirtyReasonKeys.has(orderKey(order.dashboardType, order.orderNumber)));
  }, [activeLateSheetOrders, dirtyReasonKeys, unfilledOnly]);
  const filteredLateOrderKeys = useMemo(
    () => filteredLateSheetOrders.map((order) => orderKey(order.dashboardType, order.orderNumber)),
    [filteredLateSheetOrders],
  );
  const selectedVisibleLateOrders = useMemo(
    () => filteredLateSheetOrders.filter((order) => selectedLateOrderKeys.has(orderKey(order.dashboardType, order.orderNumber))),
    [filteredLateSheetOrders, selectedLateOrderKeys],
  );
  const allFilteredLateOrdersSelected = filteredLateOrderKeys.length > 0 && filteredLateOrderKeys.every((key) => selectedLateOrderKeys.has(key));
  const hasSelectedBulkChange = Boolean(selectedLateReason || selectedActualStatus || selectedAccountability);
  const selectedBulkChanges = [
    selectedLateReason ? `Late Reason: ${selectedLateReason}` : "",
    selectedActualStatus ? `Actual Status: ${selectedActualStatus === "confirmed-not-late" ? "Confirmed Not Late" : "System Late"}` : "",
    selectedAccountability && selectedActualStatus !== "confirmed-not-late"
      ? `Accountability: ${selectedAccountability === "warehouse-fault" ? "Warehouse Fault" : "Not Warehouse Fault"}`
      : "",
  ].filter(Boolean);

  const summaryOrders = view === "B2B" ? b2bActualLateOrders : dtcActualLateOrders;
  const accountabilityOrders = summaryOrders.filter((order) => order.reason.trim());
  const jsFaultOrders = accountabilityOrders.filter((order) => order.jsFault);
  const outsideControlOrders = accountabilityOrders.filter((order) => !order.jsFault);
  const accountabilityRate = accountabilityOrders.length ? jsFaultOrders.length / accountabilityOrders.length : null;
  const accountabilityData = [
    { name: "Warehouse Accountable", value: jsFaultOrders.length, color: "#bd4c3f" },
    { name: "Outside Warehouse Control", value: outsideControlOrders.length, color: "#2f8b7b" },
  ];
  const activeSection = view === "B2B" ? dashboard.b2b : dashboard.dtc;
  const selectedRange = reportDateRange(dashboard.meta.reportLabel);
  const currentSheetOrders = view === "B2B" ? b2bSheetOrders : dtcSheetOrders;
  const confirmedNotLateThisWeek = selectedRange
    ? currentSheetOrders.filter((order) => order.confirmedNotLate && order.shippedDate >= selectedRange.start && order.shippedDate <= selectedRange.end).length
    : 0;
  const adjustedLateOrders = Math.max(0, activeSection.kpis.lateOrders - confirmedNotLateThisWeek);
  const adjustedOnTimeRate = activeSection.kpis.reportWeekOrders
    ? (activeSection.kpis.reportWeekOrders - adjustedLateOrders) / activeSection.kpis.reportWeekOrders
    : activeSection.kpis.onTimeRate;
  const adjustedPerformance = activeSection.performance.map((row) => {
    const confirmedForEntity = selectedRange
      ? currentSheetOrders.filter((order) =>
        order.confirmedNotLate && order.name === row.name &&
        order.shippedDate >= selectedRange.start && order.shippedDate <= selectedRange.end).length
      : 0;
    if (!confirmedForEntity || row.lateOrders == null) return row;
    const lateOrders = Math.max(0, row.lateOrders - confirmedForEntity);
    return {
      ...row,
      lateOrders,
      onTimeRate: row.shippedOrders ? (row.shippedOrders - lateOrders) / row.shippedOrders : row.onTimeRate,
    };
  });
  const dirtyActiveCount = activeLateSheetOrders.filter((order) => dirtyReasonKeys.has(orderKey(order.dashboardType, order.orderNumber))).length;

  const reasonSummary = useMemo(() => LATE_REASON_OPTIONS.map((reason) => ({
    label: reason,
    value: summaryOrders.filter((order) => order.reason === reason).length,
  })).sort((a, b) => b.value - a.value), [summaryOrders]);

  async function uploadWorkbook(file?: File) {
    if (!file || !canEdit) return;
    setUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    try {
      const parsed = await parseDashboardWorkbook(file);
      const form = new FormData();
      form.append("file", file);
      form.append("dashboard", JSON.stringify(parsed));
      const response = await fetch("/api/dashboard", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      setDashboard(payload.dashboard);
      if (payload.snapshot) {
        setSnapshots((current) => [payload.snapshot, ...current.filter((item) => item.key !== payload.snapshot.key)]);
        setSelectedSnapshotKey(payload.snapshot.key);
      }
      setUploadSuccess(true);
      window.setTimeout(() => setUploadOpen(false), 900);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The workbook could not be processed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function patchReason(order: LateOrder, field: "reason" | "remarks" | "confirmedNotLate" | "jsFault", value: string | boolean) {
    if (!canEdit) return;
    const key = orderKey(order.dashboardType, order.orderNumber);
    setReasonEdits((current) => {
      const existing = current[key];
      let reason = existing?.reason ?? order.reason;
      let remarks = existing?.remarks ?? order.remarks;
      let confirmedNotLate = existing?.confirmedNotLate ?? order.confirmedNotLate ?? false;
      let jsFault = existing?.jsFault ?? order.jsFault ?? defaultJsFaultForReason(reason);
      if (field === "reason") {
        reason = String(value);
        jsFault = defaultJsFaultForReason(reason);
      } else if (field === "remarks") {
        remarks = String(value);
      } else if (field === "confirmedNotLate") {
        confirmedNotLate = Boolean(value);
        jsFault = confirmedNotLate ? false : defaultJsFaultForReason(reason);
      } else {
        jsFault = Boolean(value);
      }
      return {
        ...current,
        [key]: {
          ...existing,
          orderKey: key,
          orderNumber: order.orderNumber,
          dashboardType: order.dashboardType,
          reason,
          remarks,
          confirmedNotLate,
          jsFault,
        },
      };
    });
    setDirtyReasonKeys((current) => new Set(current).add(key));
  }

  function reasonEditForOrder(order: LateOrder) {
    const key = orderKey(order.dashboardType, order.orderNumber);
    const currentEdit = reasonEdits[key];
    const reason = currentEdit?.reason ?? order.reason;
    const confirmedNotLate = currentEdit?.confirmedNotLate ?? order.confirmedNotLate ?? false;
    return {
      ...currentEdit,
      orderKey: key,
      orderNumber: order.orderNumber,
      dashboardType: order.dashboardType,
      reason,
      remarks: currentEdit?.remarks ?? order.remarks,
      confirmedNotLate,
      jsFault: confirmedNotLate ? false : currentEdit?.jsFault ?? order.jsFault ?? defaultJsFaultForReason(reason),
      entityName: order.name,
      reportKey: selectedSnapshotKey,
      reportLabel: dashboard.meta.reportLabel,
      orderDate: order.orderDate,
      shippedDate: order.shippedDate,
      processingDays: order.businessDays,
      slaDays: order.dashboardType === "B2B" ? confirmedB2bSlaDays(order.name, order.slaDays) : null,
    } satisfies ReasonEdit;
  }

  async function saveReason(order: LateOrder) {
    if (!canEdit) return;
    const key = orderKey(order.dashboardType, order.orderNumber);
    const edit = reasonEditForOrder(order);
    setSavingKey(key);
    setSavedKey("");
    try {
      const response = await fetch("/api/late-reasons", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setReasonEdits((current) => ({ ...current, [key]: { ...edit, ...payload.edit } }));
      setDirtyReasonKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setSavedKey(key);
      window.setTimeout(() => setSavedKey(""), 1800);
    } finally {
      setSavingKey("");
    }
  }

  async function saveAllReasons() {
    if (!canEdit || !dirtyActiveCount) return;
    const orders = activeLateSheetOrders.filter((order) => dirtyReasonKeys.has(orderKey(order.dashboardType, order.orderNumber)));
    const edits = orders.map(reasonEditForOrder);
    setSavingAll(true);
    setSavedKey("");
    try {
      const response = await fetch("/api/late-reasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save all failed");
      setReasonEdits((current) => {
        const next = { ...current };
        for (const edit of edits) next[edit.orderKey] = edit;
        for (const saved of payload.edits ?? []) next[saved.orderKey] = { ...next[saved.orderKey], ...saved };
        return next;
      });
      setDirtyReasonKeys((current) => {
        const next = new Set(current);
        for (const edit of edits) next.delete(edit.orderKey);
        return next;
      });
      setSavedKey("all");
      window.setTimeout(() => setSavedKey(""), 1800);
    } finally {
      setSavingAll(false);
    }
  }

  function toggleLateOrderSelection(key: string) {
    setSelectedUpdateSuccess("");
    setSelectedLateOrderKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllFilteredLateOrders() {
    setSelectedUpdateSuccess("");
    setSelectedLateOrderKeys((current) => {
      const next = new Set(current);
      if (allFilteredLateOrdersSelected) {
        for (const key of filteredLateOrderKeys) next.delete(key);
      } else {
        for (const key of filteredLateOrderKeys) next.add(key);
      }
      return next;
    });
  }

  async function updateSelectedLateOrders() {
    if (!canEdit || !hasSelectedBulkChange || !selectedVisibleLateOrders.length) return;
    const orders = selectedVisibleLateOrders;
    const edits = orders.map((order) => {
      const edit = reasonEditForOrder(order);
      const reason = selectedLateReason || edit.reason;
      const confirmedNotLate = selectedActualStatus === "confirmed-not-late"
        ? true
        : selectedActualStatus === "system-late"
          ? false
          : edit.confirmedNotLate;
      let jsFault = edit.jsFault;
      if (confirmedNotLate) {
        jsFault = false;
      } else if (selectedAccountability) {
        jsFault = selectedAccountability === "warehouse-fault";
      } else if (selectedLateReason || (selectedActualStatus === "system-late" && edit.confirmedNotLate)) {
        jsFault = defaultJsFaultForReason(reason);
      }
      return {
        ...edit,
        reason,
        confirmedNotLate,
        jsFault,
      } satisfies ReasonEdit;
    });
    setSelectedUpdateSaving(true);
    setSelectedUpdateError("");
    setSelectedUpdateSuccess("");
    try {
      const response = await fetch("/api/late-reasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Bulk update failed");
      setReasonEdits((current) => {
        const next = { ...current };
        for (const edit of edits) next[edit.orderKey] = edit;
        for (const saved of payload.edits ?? []) next[saved.orderKey] = { ...next[saved.orderKey], ...saved };
        return next;
      });
      setDirtyReasonKeys((current) => {
        const next = new Set(current);
        for (const edit of edits) next.delete(edit.orderKey);
        return next;
      });
      setSelectedLateOrderKeys(new Set());
      setSelectedLateReason("");
      setSelectedActualStatus("");
      setSelectedAccountability("");
      setSelectedUpdateOpen(false);
      setSelectedUpdateSuccess(`${edits.length} orders updated`);
      window.setTimeout(() => setSelectedUpdateSuccess(""), 2400);
    } catch (error) {
      setSelectedUpdateError(error instanceof Error ? error.message : "The selected orders could not be updated");
    } finally {
      setSelectedUpdateSaving(false);
    }
  }

  async function exportLateReasonHistory() {
    setExporting(true);
    try {
      const response = await fetch("/api/late-reasons/export");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Export failed");
      const XLSX = await import("xlsx");
      const columns = [
        "Report Week", "Dashboard Type", "Store / Account", "Order Number", "Order Date", "Shipped Date",
        "Processing / Calendar Days", "SLA Days", "Late Reason", "Confirmed Not Late",
        ...(canEdit ? ["Warehouse Fault"] : []), "Remarks", "Saved By", "Saved At",
      ];
      const rowsForExport = (rows: Array<Record<string, unknown>>) => rows.map((row) => [
        row.reportLabel, row.dashboardType, row.entityName, row.orderNumber, row.orderDate, row.shippedDate,
        row.processingDays, row.slaDays, row.reason, row.confirmedNotLate ? "Yes" : "No",
        ...(canEdit ? [row.confirmedNotLate ? "Not Applicable" : row.jsFault ? "Yes" : "No"] : []),
        row.remarks, row.updatedBy, row.savedAt,
      ]);
      const workbook = XLSX.utils.book_new();
      const currentSheet = XLSX.utils.aoa_to_sheet([columns, ...rowsForExport(payload.current ?? [])]);
      const historySheet = XLSX.utils.aoa_to_sheet([columns, ...rowsForExport(payload.history ?? [])]);
      const widths = [30, 14, 24, 20, 13, 13, 22, 10, 23, 20, ...(canEdit ? [14] : []), 34, 18, 22].map((wch) => ({ wch }));
      currentSheet["!cols"] = widths;
      historySheet["!cols"] = widths;
      XLSX.utils.book_append_sheet(workbook, currentSheet, "Current Reasons");
      XLSX.utils.book_append_sheet(workbook, historySheet, "Change History");
      XLSX.writeFile(workbook, `Jiant-Late-Reason-History-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    } finally {
      setExporting(false);
    }
  }

  async function downloadBulkTemplate() {
    if (!canEdit || !allOpenLateOrders.length) return;
    setBulkError("");
    const XLSX = await import("xlsx");
    const columns = [
      "Report Week", "Dashboard Type", "Store / Account", "Order Number", "Order Date", "Shipped Date",
      "Processing / Calendar Days", "SLA Days", "Shipping Time Group / Days Over SLA",
      "Late Reason", "Actual Status", "Warehouse Fault", "Remarks",
    ];
    const rows = allOpenLateOrders.map((order) => [
      dashboard.meta.reportLabel,
      order.dashboardType,
      order.name,
      order.orderNumber,
      order.orderDate,
      order.shippedDate,
      order.businessDays,
      order.dashboardType === "B2B" ? confirmedB2bSlaDays(order.name, order.slaDays) : "",
      order.group,
      "",
      "System Late",
      "Auto",
      order.remarks,
    ]);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    sheet["!cols"] = [28, 15, 25, 22, 13, 13, 25, 11, 34, 24, 22, 20, 42].map((wch) => ({ wch }));
    sheet["!autofilter"] = { ref: `A1:M${rows.length + 1}` };
    const instructions = XLSX.utils.aoa_to_sheet([
      ["Bulk Late Reason Update"],
      [],
      ["Edit only these columns on the Open Late Orders sheet:"],
      ["Late Reason", "Use one of the approved values below."],
      ["Actual Status", "System Late or Confirmed Not Late."],
      ["Warehouse Fault", "Auto, Yes, No, or Not Applicable. Auto applies the dashboard default for the selected reason."],
      ["Remarks", "Optional context, up to 500 characters."],
      [],
      ["Late Reason options"],
      ...LATE_REASON_OPTIONS.map((reason) => [reason]),
      [],
      ["Upload steps"],
      ["1", "Save this workbook after completing the rows you want to update."],
      ["2", "Return to Late Order Review and open Bulk update."],
      ["3", "Upload the completed workbook. Blank rows are skipped and existing history is preserved."],
    ]);
    instructions["!cols"] = [{ wch: 28 }, { wch: 92 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Open Late Orders");
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Jiant-Open-Late-Reasons-${date}.xlsx`, { compression: true });
  }

  async function importBulkTemplate(file?: File) {
    if (!file || !canEdit) return;
    setBulkImporting(true);
    setBulkError("");
    setBulkSuccess("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("The Excel file must be 20 MB or smaller");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets["Open Late Orders"];
      if (!sheet) throw new Error("The workbook must include the Open Late Orders sheet");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const openOrderMap = new Map(allOpenLateOrders.map((order) => [orderKey(order.dashboardType, order.orderNumber), order]));
      const reasonOptions = new Map(LATE_REASON_OPTIONS.map((reason) => [reason.toLowerCase(), reason]));
      const edits: ReasonEdit[] = [];
      const seen = new Set<string>();
      const invalidRows: string[] = [];
      const value = (row: Record<string, unknown>, column: string) => String(row[column] ?? "").trim();

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const dashboardType = value(row, "Dashboard Type").toUpperCase();
        const orderNumber = value(row, "Order Number");
        if (!dashboardType && !orderNumber) return;
        if (dashboardType !== "DTC" && dashboardType !== "B2B") {
          invalidRows.push(`Row ${rowNumber}: Dashboard Type must be DTC or B2B`);
          return;
        }
        const key = orderKey(dashboardType, orderNumber);
        const order = openOrderMap.get(key);
        if (!order) {
          invalidRows.push(`Row ${rowNumber}: ${key} is not currently open for ${dashboard.meta.reportLabel}`);
          return;
        }
        if (seen.has(key)) {
          invalidRows.push(`Row ${rowNumber}: duplicate order ${key}`);
          return;
        }
        seen.add(key);

        const rawReason = value(row, "Late Reason");
        const reason = rawReason ? reasonOptions.get(rawReason.toLowerCase()) : "";
        if (rawReason && !reason) {
          invalidRows.push(`Row ${rowNumber}: invalid Late Reason`);
          return;
        }
        const rawStatus = value(row, "Actual Status").toLowerCase();
        const confirmedNotLate = rawStatus === "confirmed not late";
        if (rawStatus && rawStatus !== "system late" && !confirmedNotLate) {
          invalidRows.push(`Row ${rowNumber}: Actual Status must be System Late or Confirmed Not Late`);
          return;
        }
        const rawFault = value(row, "Warehouse Fault").toLowerCase();
        let warehouseFault = confirmedNotLate ? false : defaultJsFaultForReason(reason || "");
        if (["yes", "warehouse fault"].includes(rawFault)) warehouseFault = true;
        else if (["no", "not warehouse fault"].includes(rawFault)) warehouseFault = false;
        else if (rawFault === "not applicable" && !confirmedNotLate) {
          invalidRows.push(`Row ${rowNumber}: Not Applicable is only valid for Confirmed Not Late orders`);
          return;
        } else if (rawFault && rawFault !== "auto" && rawFault !== "not applicable") {
          invalidRows.push(`Row ${rowNumber}: Warehouse Fault must be Auto, Yes, No, or Not Applicable`);
          return;
        }
        const remarks = value(row, "Remarks").slice(0, 500);
        if (!confirmedNotLate && !reason) {
          if (remarks || (rawFault && rawFault !== "auto")) {
            invalidRows.push(`Row ${rowNumber}: choose a Late Reason or mark the order Confirmed Not Late`);
          }
          return;
        }
        edits.push({
          ...reasonEditForOrder(order),
          reason: reason || "",
          remarks,
          confirmedNotLate,
          jsFault: confirmedNotLate ? false : warehouseFault,
        });
      });

      if (invalidRows.length) {
        const preview = invalidRows.slice(0, 4).join("; ");
        throw new Error(`${preview}${invalidRows.length > 4 ? `; plus ${invalidRows.length - 4} more error(s)` : ""}`);
      }
      if (!edits.length) throw new Error("No completed rows were found. Add a Late Reason or mark an order Confirmed Not Late.");

      const savedEdits: ReasonEdit[] = [];
      for (let offset = 0; offset < edits.length; offset += 500) {
        const batch = edits.slice(offset, offset + 500);
        const response = await fetch("/api/late-reasons", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ edits: batch }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Bulk update failed");
        savedEdits.push(...(payload.edits ?? batch));
      }
      setReasonEdits((current) => {
        const next = { ...current };
        for (const edit of edits) next[edit.orderKey] = edit;
        for (const saved of savedEdits) next[saved.orderKey] = { ...next[saved.orderKey], ...saved };
        return next;
      });
      setDirtyReasonKeys((current) => {
        const next = new Set(current);
        for (const edit of edits) next.delete(edit.orderKey);
        return next;
      });
      setBulkSuccess(`${edits.length} late order${edits.length === 1 ? "" : "s"} updated. The dashboards now use the imported reasons.`);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "The bulk workbook could not be processed");
    } finally {
      setBulkImporting(false);
      if (bulkFileInput.current) bulkFileInput.current.value = "";
    }
  }

  const activeLabel = view === "LATE" ? "Late Order Review" : view === "SERIAL" ? "Serial Capture" : `${view} Performance`;
  const liveData = dashboard.meta.sourceFilename && !dashboard.meta.sourceFilename.startsWith("Sample view");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="/js-logo-white.svg" alt="Jiant Solutions" />
        </div>
        <div className="internal-badge"><ShieldCheck size={14} /> {canEdit ? "Editor access" : "View-only access"}</div>
        <nav aria-label="Dashboard navigation">
          <button className={view === "DTC" ? "active" : ""} onClick={() => setView("DTC")}><LayoutDashboard size={18} /><span>DTC Dashboard</span><ChevronRight size={15} /></button>
          <button className={view === "B2B" ? "active" : ""} onClick={() => setView("B2B")}><Users size={18} /><span>B2B Dashboard</span><ChevronRight size={15} /></button>
          <button className={view === "LATE" ? "active" : ""} onClick={() => setView("LATE")}><AlertTriangle size={18} /><span>Late Order Review</span><ChevronRight size={15} /></button>
          {canEdit && <>
            <button className={view === "SERIAL" ? "active" : ""} onClick={() => { setView("SERIAL"); setSerialMenuOpen((current) => view === "SERIAL" ? !current : true); }}><ScanLine size={18} /><span>Serial Capture</span>{serialMenuOpen && view === "SERIAL" ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
            {serialMenuOpen && view === "SERIAL" && <div className="sidebar-submenu">
              {(["orders", "scan", "bulk", "lookup", "audit"] as SerialSection[]).map((item) => <button key={item} className={serialSection === item ? "active" : ""} onClick={() => setSerialSection(item)}><i /><span>{item === "orders" ? "Orders" : item === "scan" ? "Capture" : item === "bulk" ? "Bulk Upload" : item === "lookup" ? "Serial Lookup" : "Audit Log"}</span></button>)}
            </div>}
          </>}
        </nav>
        {canEdit && <><div className="sidebar-section-label">Data management</div><button className="sidebar-upload" onClick={() => setUploadOpen(true)}><Upload size={18} /><span>Upload Excel</span></button></>}
        <div className="data-source-card">
          <span className={view === "SERIAL" ? "status-live" : liveData ? "status-live" : "status-sample"}>{view === "SERIAL" ? "Central database" : liveData ? "Live dataset" : "Sample preview"}</span>
          <strong>{view === "SERIAL" ? "Serial and carton history" : dashboard.meta.reportLabel}</strong>
          <small>{view === "SERIAL" ? "Saved across computers and sessions" : dashboard.meta.sourceFilename}</small>
        </div>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div><strong>{user.name}</strong><span>{canEdit ? "Editor" : "View only"}</span></div>
          <a href={signOutHref} aria-label="Sign out"><LogOut size={17} /></a>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">{view === "SERIAL" ? `Warehouse operations / ${serialSection}` : `Shipping intelligence / ${view}`}</span>
            <h1>{activeLabel}</h1>
          </div>
          <div className="topbar-actions">
            {view === "SERIAL" ? <span className="read-only-pill"><ShieldCheck size={14} /> Editor only</span> : snapshots.length ? (
              <label className="week-picker">
                <span>REPORT WEEK</span>
                <select
                  aria-label="Select dashboard week"
                  value={selectedSnapshotKey}
                  onChange={(event) => void selectSnapshot(event.target.value)}
                >
                  {snapshots.map((snapshot) => (
                    <option key={snapshot.key} value={snapshot.key}>{snapshot.reportLabel}</option>
                  ))}
                </select>
              </label>
            ) : <div className="report-chip"><span>REPORT PERIOD</span><strong>{dashboard.meta.reportLabel}</strong></div>}
            {view !== "SERIAL" && (canEdit ? <button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} /> Update data</button> : <span className="read-only-pill"><ShieldCheck size={14} /> View only</span>)}
          </div>
        </header>

        {loading && <div className="loading-bar"><span /></div>}
        {view === "SERIAL" ? (
          <SerialCapture section={serialSection} onSectionChange={setSerialSection} canEdit={canEdit} />
        ) : view !== "LATE" ? (
          <div className="dashboard-content">
            <section className="intro-row">
              <div><p>{view === "DTC" ? "Direct-to-consumer fulfillment" : "Retail account fulfillment"}</p><h2>Weekly shipping health at a glance</h2></div>
              <div className="health-pill"><CheckCircle2 size={16} /> {pct(adjustedOnTimeRate)} on time</div>
            </section>

            <section className="metric-grid">
              <MetricCard label="Report Week Orders" value={numberFormat.format(activeSection.kpis.reportWeekOrders)} tone="blue" detail="Orders shipped this week" />
              {view === "B2B" && <MetricCard label="Report Week Units" value={numberFormat.format(activeSection.kpis.reportWeekUnits ?? 0)} tone="gold" detail="Units shipped to accounts" />}
              <MetricCard label="On-Time Shipping Rate" value={pct(adjustedOnTimeRate)} tone="green" detail={view === "DTC" ? "Target: next business day" : "Across confirmed SLAs"} />
              <MetricCard label="Late Orders" value={numberFormat.format(adjustedLateOrders)} tone="red" detail="Excludes confirmed not late" />
              <MetricCard label="Late Order Accountability" value={pct(accountabilityRate)} tone={accountabilityRate == null ? "gold" : accountabilityRate <= .1 ? "green" : "red"} detail={`${jsFaultOrders.length} warehouse accountable · ${outsideControlOrders.length} outside control`} />
              <MetricCard label="YTD Shipped Orders" value={numberFormat.format(activeSection.kpis.ytdOrders)} tone="teal" detail="Year-to-date volume" />
              {view === "DTC" && <MetricCard label="YTD On-Time Rate" value={pct(activeSection.kpis.ytdOnTimeRate)} tone="teal" detail="Year-to-date service level" />}
            </section>

            {view === "DTC" && (
              <section className="shipping-band">
                <div className="section-heading"><div><span>Current week</span><h3>Shipping time distribution</h3></div><PackageCheck size={22} /></div>
                <div className="distribution-grid">
                  {dashboard.dtc.shippingGroups.map((group) => (
                    <div key={group.label} className={group.status === "On Time" ? "distribution-on" : "distribution-late"}>
                      <span>{group.label}</span><strong>{group.orders}</strong><small>{pct(group.share)} of week</small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="chart-grid">
              <article className="panel chart-panel">
                <div className="panel-title"><div><span>Volume</span><h3>Monthly shipped orders</h3></div><BarChart3 size={19} /></div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={activeSection.monthly} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e8ecef" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#68757e", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8a959c", fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f6f7" }} />
                    <Bar dataKey="value" name="Shipped Orders" radius={[5, 5, 0, 0]}>
                      {activeSection.monthly.map((_, index) => <Cell key={index} fill={index === activeSection.monthly.length - 1 ? "#0f766e" : "#b9d8d3"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </article>
              <article className="panel chart-panel">
                <div className="panel-title"><div><span>Momentum</span><h3>Rolling 4-week volume</h3></div><RefreshCw size={18} /></div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={activeSection.weekly} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e8ecef" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#68757e", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8a959c", fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f6f7" }} />
                    <Bar dataKey="value" name="Shipped Orders" fill="#1e4f66" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </article>
            </section>

            <section className="panel trend-panel">
              <div className="panel-title"><div><span>Service level</span><h3>Weekly on-time shipping trend</h3></div><div className="legend-note">Bars = orders · Line = on-time rate</div></div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={activeSection.trend} margin={{ top: 14, right: 10, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8ecef" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#68757e", fontSize: 12 }} />
                  <YAxis yAxisId="orders" tickLine={false} axisLine={false} tick={{ fill: "#8a959c", fontSize: 11 }} />
                  <YAxis yAxisId="rate" orientation="right" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tickLine={false} axisLine={false} tick={{ fill: "#8a959c", fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                  <Bar yAxisId="orders" dataKey="onTime" name={view === "DTC" ? "0–1 Business Day" : "Within SLA"} stackId="orders" fill="#0f766e" />
                  <Bar yAxisId="orders" dataKey="late1" name="Late band 1" stackId="orders" fill="#f2b84b" />
                  <Bar yAxisId="orders" dataKey="late2" name="Late band 2" stackId="orders" fill="#ea7e58" />
                  <Bar yAxisId="orders" dataKey="late3" name="Most late" stackId="orders" fill="#c94545" />
                  <Line yAxisId="rate" dataKey="onTimeRate" name="On-Time Rate" stroke="#172f3c" strokeWidth={2.5} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </section>

            <section className="split-section">
              <article className="panel table-panel performance-panel">
                <div className="panel-title"><div><span>{view === "DTC" ? "Store" : "Account"} detail</span><h3>{view === "DTC" ? "Store performance" : "B2B account performance"}</h3></div></div>
                <div className="table-scroll">
                  <table><thead><tr><th>{view === "DTC" ? "Store" : "Account"}</th>{view === "B2B" && <th>SLA</th>}<th>Orders</th><th>On time</th><th>Late</th></tr></thead>
                    <tbody>{adjustedPerformance.map((row) => {
                      const slaDays = view === "B2B" ? confirmedB2bSlaDays(row.name, row.slaDays) : null;
                      return <tr key={row.name}><td><strong>{row.name}</strong></td>{view === "B2B" && <td>{slaDays == null ? <span className="pending-tag">Pending</span> : `${slaDays} days`}</td>}<td>{numberFormat.format(row.shippedOrders)}</td><td><span className={(row.onTimeRate ?? 0) >= .95 ? "rate-good" : row.onTimeRate == null ? "rate-pending" : "rate-watch"}>{pct(row.onTimeRate)}</span></td><td>{row.lateOrders ?? "—"}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </article>
              <article className="panel chart-panel reason-panel">
                <div className="panel-title"><div><span>{view} root causes</span><h3>Late Reasons - 4 Weeks</h3></div></div>
                {summaryOrders.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={reasonSummary.slice(0, 6)} layout="vertical" margin={{ left: 18, right: 20 }}><CartesianGrid horizontal={false} stroke="#edf0f2" /><XAxis type="number" hide /><YAxis dataKey="label" type="category" width={125} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5f6d76" }} /><Tooltip content={<ChartTooltip />} cursor={{ fill: "#f7f2ef" }} /><Bar dataKey="value" name="Late Orders" fill="#bd4c3f" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyLateOrders canUpload={canEdit} onUpload={() => setUploadOpen(true)} />}
              </article>
            </section>

            <section className="panel accountability-panel">
              <div className="panel-title"><div><span>{view} ownership</span><h3>Late Order Accountability - 4 Weeks</h3></div><span className="accountability-rate">{pct(accountabilityRate)} Warehouse Accountability</span></div>
              {accountabilityOrders.length ? (
                <div className="accountability-content">
                  <div className="accountability-chart">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Tooltip content={<ChartTooltip />} />
                        <Pie data={accountabilityData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>
                          {accountabilityData.map((item) => <Cell key={item.name} fill={item.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="accountability-center"><strong>{pct(accountabilityRate)}</strong><span>Warehouse fault</span></div>
                  </div>
                  <div className="accountability-legend">
                    {accountabilityData.map((item) => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}
                    <p>{summaryOrders.length - accountabilityOrders.length} pending classification · Confirmed Not Late orders are excluded.</p>
                  </div>
                </div>
              ) : <div className="accountability-empty"><strong>Pending classification</strong><span>Add late reasons to calculate Warehouse Accountability.</span></div>}
            </section>

            <section className="panel late-preview-panel">
              <div className="panel-title"><div><span>Action queue</span><h3>{view} late orders</h3></div><button className="btn-text" onClick={() => setView("LATE")}>Open full review <ChevronRight size={15} /></button></div>
              {visibleLateOrders.length ? <LateOrderTable canEdit={canEdit} sheetType={view as LateSheet} orders={visibleLateOrders.slice(0, 5)} edits={reasonEdits} savingKey={savingKey} savedKey={savedKey} savingAll={savingAll} onPatch={patchReason} onSave={saveReason} compact /> : <EmptyLateOrders canUpload={canEdit} onUpload={() => setUploadOpen(true)} />}
            </section>
          </div>
        ) : (
          <div className="dashboard-content review-content">
            <section className="review-hero"><div><span>{canEdit ? "Collaborative workflow" : "Read-only register"}</span><h2>{canEdit ? "Complete every late-order reason" : "Review every late-order reason"}</h2><p>{canEdit ? "Classify each order, confirm false positives, and assign accountability. Saved changes flow directly into the matching dashboard." : "This account can review saved reasons, order status, and remarks but cannot change them."}</p></div><div className="review-stats"><div><strong>{activeLateSheetOrders.length}</strong><span>System flagged</span></div><div><strong>{activeActualLateOrders.length}</strong><span>Actual late</span></div>{canEdit ? <div><strong>{pct(activeActualLateOrders.filter((order) => order.reason).length ? activeActualLateOrders.filter((order) => order.reason && order.jsFault).length / activeActualLateOrders.filter((order) => order.reason).length : null)}</strong><span>Warehouse accountability</span></div> : <div><strong>{activeActualLateOrders.filter((order) => order.reason).length}</strong><span>Classified</span></div>}<div><strong>{openLateOrderCount}</strong><span>Open</span></div></div></section>
            <section className="panel review-table-panel">
              <div className="review-table-heading">
                <div className="panel-title"><div><span>Editable workbook</span><h3>Late order reason register</h3></div></div>
                <div className="review-tools">
                  <div className="sheet-tabs" role="tablist" aria-label="Late order sheets">
                    <button type="button" role="tab" aria-selected={lateSheet === "DTC"} className={lateSheet === "DTC" ? "active" : ""} onClick={() => { setLateSheet("DTC"); setSelectedLateOrderKeys(new Set()); }}>DTC Late Orders <span>{dtcSheetOrders.length}</span></button>
                    <button type="button" role="tab" aria-selected={lateSheet === "B2B"} className={lateSheet === "B2B" ? "active" : ""} onClick={() => { setLateSheet("B2B"); setSelectedLateOrderKeys(new Set()); }}>B2B Late Orders <span>{b2bSheetOrders.length}</span></button>
                  </div>
                  <button type="button" className={`filter-button ${unfilledOnly ? "active" : ""}`} aria-pressed={unfilledOnly} onClick={() => { setUnfilledOnly((current) => !current); setSelectedLateOrderKeys(new Set()); }}><ListFilter size={15} /> Unfilled only <span>{openLateOrderCount}</span></button>
                  {canEdit && <button type="button" className="bulk-button" onClick={() => { setBulkError(""); setBulkSuccess(""); setBulkOpen(true); }}><FileSpreadsheet size={15} /> Bulk update <span>{allOpenLateOrders.length}</span></button>}
                  {canEdit && <button type="button" className={`save-all-button ${savedKey === "all" ? "saved" : ""}`} onClick={() => void saveAllReasons()} disabled={savingAll || !dirtyActiveCount}>{savingAll ? <RefreshCw className="spin" size={15} /> : savedKey === "all" ? <Check size={15} /> : <Save size={15} />} {savingAll ? "Saving…" : dirtyActiveCount ? `Save All (${dirtyActiveCount})` : savedKey === "all" ? "Saved" : "All Saved"}</button>}
                  <button type="button" className="export-button" onClick={() => void exportLateReasonHistory()} disabled={exporting}><Download size={15} /> {exporting ? "Exporting…" : "Export history"}</button>
                </div>
              </div>
              <p className="sheet-help">{canEdit ? `Choose the late reason, confirm whether the order is actually late, and override Warehouse Fault when needed. Save each row or use Save All; the ${lateSheet} Dashboard updates immediately. Out of Stock, Pre-Order, Address Issue, and Customer Request default to Not Warehouse Fault.` : "View-only account: saved reasons, status, and remarks cannot be changed."} Rows are sorted by Shipped Date, newest first.</p>
              {canEdit && filteredLateSheetOrders.length > 0 && (
                <div className="selected-update-bar">
                  <label className="select-visible-control">
                    <input type="checkbox" checked={allFilteredLateOrdersSelected} onChange={toggleAllFilteredLateOrders} />
                    <span>Select all visible</span>
                  </label>
                  <span className="selected-count">{selectedVisibleLateOrders.length} selected</span>
                  <select aria-label="Late reason for selected orders" value={selectedLateReason} onChange={(event) => { setSelectedLateReason(event.target.value); setSelectedUpdateError(""); }}>
                    <option value="">Late Reason · No change</option>
                    {LATE_REASON_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <select aria-label="Actual status for selected orders" value={selectedActualStatus} onChange={(event) => {
                    const value = event.target.value as "" | "system-late" | "confirmed-not-late";
                    setSelectedActualStatus(value);
                    if (value === "confirmed-not-late") setSelectedAccountability("");
                    setSelectedUpdateError("");
                  }}>
                    <option value="">Actual Status · No change</option>
                    <option value="system-late">System Late</option>
                    <option value="confirmed-not-late">Confirmed Not Late</option>
                  </select>
                  <select aria-label="Accountability for selected orders" value={selectedAccountability} disabled={selectedActualStatus === "confirmed-not-late"} onChange={(event) => { setSelectedAccountability(event.target.value as "" | "warehouse-fault" | "not-warehouse-fault"); setSelectedUpdateError(""); }}>
                    <option value="">Accountability · No change</option>
                    <option value="warehouse-fault">Warehouse Fault</option>
                    <option value="not-warehouse-fault">Not Warehouse Fault</option>
                  </select>
                  <button type="button" className="update-selected-button" disabled={!selectedVisibleLateOrders.length || !hasSelectedBulkChange || selectedUpdateSaving} onClick={() => { setSelectedUpdateError(""); setSelectedUpdateOpen(true); }}>
                    <Check size={15} /> Update Selected
                  </button>
                  {selectedUpdateSuccess && <span className="inline-success"><CheckCircle2 size={14} /> {selectedUpdateSuccess}</span>}
                  {selectedUpdateError && !selectedUpdateOpen && <span className="inline-error"><AlertTriangle size={14} /> {selectedUpdateError}</span>}
                </div>
              )}
              <div role="tabpanel" aria-label={`${lateSheet} Late Orders`}>
                {filteredLateSheetOrders.length ? <LateOrderTable canEdit={canEdit} sheetType={lateSheet} orders={filteredLateSheetOrders} edits={reasonEdits} savingKey={savingKey} savedKey={savedKey} savingAll={savingAll || selectedUpdateSaving} selectedKeys={selectedLateOrderKeys} onToggleSelected={toggleLateOrderSelection} onPatch={patchReason} onSave={saveReason} /> : activeLateSheetOrders.length && unfilledOnly ? <div className="filtered-empty"><CheckCircle2 size={24} /><strong>All late reasons are filled</strong><span>Turn off “Unfilled only” to review every order.</span></div> : <EmptyLateOrders canUpload={canEdit} onUpload={() => setUploadOpen(true)} />}
              </div>
            </section>
          </div>
        )}
      </main>

      {canEdit && uploadOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Upload dashboard workbook">
          <div className="upload-modal">
            <button className="modal-close" onClick={() => setUploadOpen(false)} aria-label="Close"><X size={20} /></button>
            <div className="modal-icon"><FileSpreadsheet size={26} /></div>
            <span className="eyebrow">Data refresh</span>
            <h2>Upload the latest dashboard</h2>
            <p>Use the generated Excel workbook containing DTC Dashboard, B2B Dashboard, and both Late Orders sheets.</p>
            <label className={`drop-zone ${uploading ? "is-uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadWorkbook(event.dataTransfer.files[0]); }}>
              <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.xls" onChange={(event) => void uploadWorkbook(event.target.files?.[0])} disabled={uploading} />
              {uploading ? <><RefreshCw className="spin" size={30} /><strong>Reading and publishing workbook…</strong><span>正在更新所有图表与订单明细</span></> : uploadSuccess ? <><Check className="success-check" size={30} /><strong>Dashboard updated</strong><span>Your team will now see the new report.</span></> : <><Upload size={30} /><strong>Drop Excel here or click to browse</strong><span>.xlsx, .xlsm or .xls · up to 20 MB</span></>}
            </label>
            {uploadError && <div className="error-message"><AlertTriangle size={16} /> {uploadError}</div>}
            <div className="privacy-note"><ShieldCheck size={16} /><span>Files and order details are stored inside the private workspace and are not added to GitHub.</span></div>
          </div>
        </div>
      )}

      {canEdit && bulkOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Bulk update late reasons">
          <div className="upload-modal bulk-modal">
            <button className="modal-close" onClick={() => setBulkOpen(false)} aria-label="Close"><X size={20} /></button>
            <div className="modal-icon"><FileSpreadsheet size={26} /></div>
            <span className="eyebrow">Bulk workflow</span>
            <h2>Update late reasons in Excel</h2>
            <p>Download every open DTC and B2B late order for {dashboard.meta.reportLabel}, complete the editable columns, then upload the same workbook.</p>
            <div className="bulk-summary">
              <div><strong>{allOpenLateOrders.length}</strong><span>Total open</span></div>
              <div><strong>{allOpenLateOrders.filter((order) => order.dashboardType === "DTC").length}</strong><span>DTC</span></div>
              <div><strong>{allOpenLateOrders.filter((order) => order.dashboardType === "B2B").length}</strong><span>B2B</span></div>
            </div>
            <button type="button" className="bulk-download" onClick={() => void downloadBulkTemplate()} disabled={!allOpenLateOrders.length}>
              <Download size={18} /><span><strong>Download open late orders</strong><small>Excel template with every row still awaiting a reason</small></span>
            </button>
            <div className="bulk-divider"><span>then upload the completed file</span></div>
            <label className={`drop-zone bulk-drop-zone ${bulkImporting ? "is-uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importBulkTemplate(event.dataTransfer.files[0]); }}>
              <input ref={bulkFileInput} type="file" accept=".xlsx,.xlsm,.xls" onChange={(event) => void importBulkTemplate(event.target.files?.[0])} disabled={bulkImporting} />
              {bulkImporting ? <><RefreshCw className="spin" size={27} /><strong>Importing completed rows…</strong><span>Existing history will be preserved</span></> : <><Upload size={27} /><strong>Drop the completed Excel here</strong><span>Blank rows are skipped · up to 20 MB</span></>}
            </label>
            {bulkError && <div className="error-message"><AlertTriangle size={16} /> {bulkError}</div>}
            {bulkSuccess && <div className="success-message"><CheckCircle2 size={16} /> {bulkSuccess}</div>}
          </div>
        </div>
      )}

      {canEdit && selectedUpdateOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm selected late reason update">
          <div className="upload-modal selected-update-modal">
            <button className="modal-close" onClick={() => !selectedUpdateSaving && setSelectedUpdateOpen(false)} aria-label="Close"><X size={20} /></button>
            <div className="modal-icon"><Check size={26} /></div>
            <span className="eyebrow">Confirm bulk update</span>
            <h2>Update {selectedVisibleLateOrders.length} orders?</h2>
            <p>Only the selected, currently visible {lateSheet} orders will be updated. Fields marked “No change” will keep their current values.</p>
            <div className="confirm-selection-summary"><span>Selected orders</span><strong>{selectedVisibleLateOrders.length}</strong></div>
            <div className="confirm-change-list" aria-label="Changes to apply">
              {selectedBulkChanges.map((change) => <span key={change}><Check size={13} /> {change}</span>)}
              {selectedActualStatus === "confirmed-not-late" && <small>Accountability will be Not Applicable for these orders.</small>}
            </div>
            {selectedUpdateError && <div className="error-message"><AlertTriangle size={16} /> {selectedUpdateError}</div>}
            <div className="selected-update-actions">
              <button type="button" className="btn-secondary" disabled={selectedUpdateSaving} onClick={() => setSelectedUpdateOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={selectedUpdateSaving} onClick={() => void updateSelectedLateOrders()}>{selectedUpdateSaving ? <RefreshCw className="spin" size={16} /> : <Check size={16} />} {selectedUpdateSaving ? "Updating…" : `Update ${selectedVisibleLateOrders.length} Orders`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LateOrderTable({ canEdit, sheetType, orders, edits, savingKey, savedKey, savingAll, selectedKeys, onToggleSelected, onPatch, onSave, compact = false }: {
  canEdit: boolean;
  sheetType: LateSheet;
  orders: LateOrder[];
  edits: Record<string, ReasonEdit>;
  savingKey: string;
  savedKey: string;
  savingAll: boolean;
  selectedKeys?: Set<string>;
  onToggleSelected?: (key: string) => void;
  onPatch: (order: LateOrder, field: "reason" | "remarks" | "confirmedNotLate" | "jsFault", value: string | boolean) => void;
  onSave: (order: LateOrder) => void;
  compact?: boolean;
}) {
  const showSelection = Boolean(canEdit && !compact && selectedKeys && onToggleSelected);
  return (
    <div className="table-scroll late-table-wrap"><table className={`late-table late-table-${sheetType.toLowerCase()} ${canEdit ? "late-table-editor" : "late-table-viewer"}`}><thead><tr>{showSelection && <th className="selection-column"><span className="sr-only">Select</span></th>}<th>{sheetType === "DTC" ? "Store Name" : "Account"}</th><th>Order Number</th><th>Order Date</th><th>Shipped Date</th><th>{sheetType === "DTC" ? "Processing Days" : "Calendar Days"}</th>{sheetType === "DTC" ? <th>Shipping Time Group</th> : <><th>SLA Days</th><th>Days Over SLA</th></>}<th>Late Reason</th><th>Actual Status</th>{canEdit && <th>Accountability</th>}<th>Remarks</th>{canEdit && <th />}</tr></thead><tbody>{orders.map((order) => {
      const key = orderKey(order.dashboardType, order.orderNumber);
      const edit = edits[key];
      const reason = edit?.reason ?? order.reason;
      const remarks = edit?.remarks ?? order.remarks;
      const confirmedNotLate = edit?.confirmedNotLate ?? order.confirmedNotLate ?? false;
      const jsFault = confirmedNotLate ? false : edit?.jsFault ?? order.jsFault ?? defaultJsFaultForReason(reason);
      const slaDays = sheetType === "B2B" ? confirmedB2bSlaDays(order.name, order.slaDays) : null;
      return <tr key={key} className={`${confirmedNotLate ? "confirmed-not-late-row" : ""} ${selectedKeys?.has(key) ? "selected-order-row" : ""}`}>
        {showSelection && <td className="selection-column"><input type="checkbox" aria-label={`Select ${order.orderNumber}`} checked={selectedKeys!.has(key)} onChange={() => onToggleSelected!(key)} /></td>}
        <td className="entity-cell"><strong>{order.name}</strong></td>
        <td><code>{order.orderNumber}</code></td>
        <td>{formatDate(order.orderDate)}</td>
        <td>{formatDate(order.shippedDate)}</td>
        <td><span className="delay-badge">{order.businessDays} days</span></td>
        {sheetType === "DTC" ? <td>{order.group}</td> : <><td>{slaDays == null ? "—" : `${slaDays} days`}</td><td>{order.group}</td></>}
        <td>{canEdit ? <select aria-label={`Late reason for ${order.orderNumber}`} value={reason} onChange={(event) => onPatch(order, "reason", event.target.value)}><option value="">Select reason</option>{LATE_REASON_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <span className="read-only-cell">{reason || "Not classified"}</span>}</td>
        <td>{canEdit ? <button type="button" className={`status-toggle ${confirmedNotLate ? "not-late" : "late"}`} aria-pressed={confirmedNotLate} onClick={() => onPatch(order, "confirmedNotLate", !confirmedNotLate)}>{confirmedNotLate ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{confirmedNotLate ? "Confirmed Not Late" : "System Late"}</button> : <span className={`status-tag ${confirmedNotLate ? "not-late" : "late"}`}>{confirmedNotLate ? "Confirmed Not Late" : "System Late"}</span>}</td>
        {canEdit && <td><button type="button" className={`fault-toggle ${confirmedNotLate ? "not-applicable" : jsFault ? "js-fault" : "not-js-fault"}`} aria-pressed={!confirmedNotLate && jsFault} disabled={confirmedNotLate} onClick={() => onPatch(order, "jsFault", !jsFault)}>{confirmedNotLate ? "Not Applicable" : jsFault ? "Warehouse Fault" : "Not Warehouse Fault"}</button></td>}
        <td>{canEdit ? <input aria-label={`Remarks for ${order.orderNumber}`} value={remarks} placeholder={compact ? "Add note" : "Add context for the team"} onChange={(event) => onPatch(order, "remarks", event.target.value)} /> : <span className="read-only-cell">{remarks || "—"}</span>}</td>
        {canEdit && <td><button className={`save-row ${savedKey === key ? "saved" : ""}`} aria-label={`Save ${order.orderNumber}`} onClick={() => void onSave(order)} disabled={savingKey === key || savingAll}>{savingKey === key ? <RefreshCw className="spin" size={16} /> : savedKey === key ? <Check size={16} /> : <Save size={16} />}</button></td>}
      </tr>;
    })}</tbody></table></div>
  );
}
