"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  RefreshCw,
  Save,
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDashboardWorkbook } from "../lib/dashboard-parser";
import {
  LATE_REASON_OPTIONS,
  orderKey,
  type DashboardData,
  type LateOrder,
  type ReasonEdit,
} from "../lib/dashboard-types";
import { sampleDashboard } from "../lib/sample-dashboard";

type View = "DTC" | "B2B" | "LATE";

const numberFormat = new Intl.NumberFormat("en-US");
const pct = (value: number | null | undefined) => value == null ? "Pending" : `${(value * 100).toFixed(1)}%`;
const formatDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

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

function EmptyLateOrders({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><FileSpreadsheet size={24} /></div>
      <h3>Upload a live workbook to review orders</h3>
      <p>The sample view excludes order-level details. Your uploaded workbook stays behind the private login.</p>
      <button className="btn-primary" onClick={onUpload}><Upload size={16} /> Upload Excel</button>
    </div>
  );
}

export function DashboardApp({ user, signOutHref }: { user: { name: string; email: string }; signOutHref: string }) {
  const [view, setView] = useState<View>("DTC");
  const [dashboard, setDashboard] = useState<DashboardData>(sampleDashboard);
  const [reasonEdits, setReasonEdits] = useState<Record<string, ReasonEdit>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => {
        if (!active) return;
        if (payload.dashboard) setDashboard(payload.dashboard);
        const edits: Record<string, ReasonEdit> = {};
        for (const edit of payload.reasonEdits ?? []) edits[edit.orderKey] = edit;
        setReasonEdits(edits);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const dtcLate = dashboard.dtc.lateOrders;
  const b2bLate = dashboard.b2b.lateOrders;
  const allLateOrders = useMemo(() => [...dtcLate, ...b2bLate].map((order) => {
    const edit = reasonEdits[orderKey(order.dashboardType, order.orderNumber)];
    return edit ? { ...order, reason: edit.reason, remarks: edit.remarks } : order;
  }), [dtcLate, b2bLate, reasonEdits]);

  const visibleLateOrders = view === "DTC"
    ? allLateOrders.filter((order) => order.dashboardType === "DTC")
    : view === "B2B"
      ? allLateOrders.filter((order) => order.dashboardType === "B2B")
      : allLateOrders;

  const reasonSummary = useMemo(() => LATE_REASON_OPTIONS.map((reason) => ({
    label: reason,
    value: allLateOrders.filter((order) => order.reason === reason).length,
  })).sort((a, b) => b.value - a.value), [allLateOrders]);

  async function uploadWorkbook(file?: File) {
    if (!file) return;
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
      setUploadSuccess(true);
      window.setTimeout(() => setUploadOpen(false), 900);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The workbook could not be processed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function patchReason(order: LateOrder, field: "reason" | "remarks", value: string) {
    const key = orderKey(order.dashboardType, order.orderNumber);
    setReasonEdits((current) => ({
      ...current,
      [key]: {
        orderKey: key,
        orderNumber: order.orderNumber,
        dashboardType: order.dashboardType,
        reason: current[key]?.reason ?? order.reason,
        remarks: current[key]?.remarks ?? order.remarks,
        [field]: value,
      },
    }));
  }

  async function saveReason(order: LateOrder) {
    const key = orderKey(order.dashboardType, order.orderNumber);
    const edit = reasonEdits[key] ?? {
      orderKey: key,
      orderNumber: order.orderNumber,
      dashboardType: order.dashboardType,
      reason: order.reason,
      remarks: order.remarks,
    };
    setSavingKey(key);
    setSavedKey("");
    try {
      const response = await fetch("/api/late-reasons", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (!response.ok) throw new Error();
      setSavedKey(key);
      window.setTimeout(() => setSavedKey(""), 1800);
    } finally {
      setSavingKey("");
    }
  }

  const activeSection = view === "B2B" ? dashboard.b2b : dashboard.dtc;
  const activeLabel = view === "LATE" ? "Late Order Review" : `${view} Performance`;
  const liveData = dashboard.meta.sourceFilename && !dashboard.meta.sourceFilename.startsWith("Sample view");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="/js-logo-white.svg" alt="Jiant Solutions" />
        </div>
        <div className="internal-badge"><ShieldCheck size={14} /> Internal workspace</div>
        <nav aria-label="Dashboard navigation">
          <button className={view === "DTC" ? "active" : ""} onClick={() => setView("DTC")}><LayoutDashboard size={18} /><span>DTC Dashboard</span><ChevronRight size={15} /></button>
          <button className={view === "B2B" ? "active" : ""} onClick={() => setView("B2B")}><Users size={18} /><span>B2B Dashboard</span><ChevronRight size={15} /></button>
          <button className={view === "LATE" ? "active" : ""} onClick={() => setView("LATE")}><AlertTriangle size={18} /><span>Late Order Review</span><ChevronRight size={15} /></button>
        </nav>
        <div className="sidebar-section-label">Data management</div>
        <button className="sidebar-upload" onClick={() => setUploadOpen(true)}><Upload size={18} /><span>Upload Excel</span></button>
        <div className="data-source-card">
          <span className={liveData ? "status-live" : "status-sample"}>{liveData ? "Live dataset" : "Sample preview"}</span>
          <strong>{dashboard.meta.reportLabel}</strong>
          <small>{dashboard.meta.sourceFilename}</small>
        </div>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div><strong>{user.name}</strong><span>{user.email}</span></div>
          <a href={signOutHref} aria-label="Sign out"><LogOut size={17} /></a>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">Shipping intelligence / {view}</span>
            <h1>{activeLabel}</h1>
          </div>
          <div className="topbar-actions">
            <div className="report-chip"><span>REPORT PERIOD</span><strong>{dashboard.meta.reportLabel}</strong></div>
            <button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} /> Update data</button>
          </div>
        </header>

        {loading && <div className="loading-bar"><span /></div>}
        {view !== "LATE" ? (
          <div className="dashboard-content">
            <section className="intro-row">
              <div><p>{view === "DTC" ? "Direct-to-consumer fulfillment" : "Retail account fulfillment"}</p><h2>Weekly shipping health at a glance</h2></div>
              <div className="health-pill"><CheckCircle2 size={16} /> {pct(activeSection.kpis.onTimeRate)} on time</div>
            </section>

            <section className="metric-grid">
              <MetricCard label="Report Week Orders" value={numberFormat.format(activeSection.kpis.reportWeekOrders)} tone="blue" detail="Orders shipped this week" />
              {view === "B2B" && <MetricCard label="Report Week Units" value={numberFormat.format(activeSection.kpis.reportWeekUnits ?? 0)} tone="gold" detail="Units shipped to accounts" />}
              <MetricCard label="On-Time Shipping Rate" value={pct(activeSection.kpis.onTimeRate)} tone="green" detail={view === "DTC" ? "Target: next business day" : "Across confirmed SLAs"} />
              <MetricCard label="Late Orders" value={numberFormat.format(activeSection.kpis.lateOrders)} tone="red" detail="Needs review or follow-up" />
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
                    <tbody>{activeSection.performance.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td>{view === "B2B" && <td>{row.slaDays == null ? <span className="pending-tag">Pending</span> : `${row.slaDays} days`}</td>}<td>{numberFormat.format(row.shippedOrders)}</td><td><span className={(row.onTimeRate ?? 0) >= .95 ? "rate-good" : row.onTimeRate == null ? "rate-pending" : "rate-watch"}>{pct(row.onTimeRate)}</span></td><td>{row.lateOrders ?? "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              </article>
              <article className="panel chart-panel reason-panel">
                <div className="panel-title"><div><span>Root causes</span><h3>Late reason summary</h3></div></div>
                {allLateOrders.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={reasonSummary.slice(0, 6)} layout="vertical" margin={{ left: 18, right: 20 }}><CartesianGrid horizontal={false} stroke="#edf0f2" /><XAxis type="number" hide /><YAxis dataKey="label" type="category" width={125} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5f6d76" }} /><Tooltip content={<ChartTooltip />} cursor={{ fill: "#f7f2ef" }} /><Bar dataKey="value" name="Late Orders" fill="#bd4c3f" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyLateOrders onUpload={() => setUploadOpen(true)} />}
              </article>
            </section>

            <section className="panel late-preview-panel">
              <div className="panel-title"><div><span>Action queue</span><h3>{view} late orders</h3></div><button className="btn-text" onClick={() => setView("LATE")}>Open full review <ChevronRight size={15} /></button></div>
              {visibleLateOrders.length ? <LateOrderTable orders={visibleLateOrders.slice(0, 5)} edits={reasonEdits} savingKey={savingKey} savedKey={savedKey} onPatch={patchReason} onSave={saveReason} compact /> : <EmptyLateOrders onUpload={() => setUploadOpen(true)} />}
            </section>
          </div>
        ) : (
          <div className="dashboard-content review-content">
            <section className="review-hero"><div><span>Collaborative workflow</span><h2>Complete every late-order reason</h2><p>Reason and remarks are saved independently from the workbook, so your team can keep updating the queue after each upload.</p></div><div className="review-stats"><div><strong>{allLateOrders.length}</strong><span>Total late</span></div><div><strong>{allLateOrders.filter((order) => order.reason).length}</strong><span>Classified</span></div><div><strong>{allLateOrders.filter((order) => !order.reason).length}</strong><span>Open</span></div></div></section>
            <section className="panel review-table-panel"><div className="panel-title"><div><span>DTC + B2B</span><h3>Late order reason register</h3></div></div>{allLateOrders.length ? <LateOrderTable orders={allLateOrders} edits={reasonEdits} savingKey={savingKey} savedKey={savedKey} onPatch={patchReason} onSave={saveReason} /> : <EmptyLateOrders onUpload={() => setUploadOpen(true)} />}</section>
          </div>
        )}
      </main>

      {uploadOpen && (
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
    </div>
  );
}

function LateOrderTable({ orders, edits, savingKey, savedKey, onPatch, onSave, compact = false }: { orders: LateOrder[]; edits: Record<string, ReasonEdit>; savingKey: string; savedKey: string; onPatch: (order: LateOrder, field: "reason" | "remarks", value: string) => void; onSave: (order: LateOrder) => void; compact?: boolean }) {
  return (
    <div className="table-scroll late-table-wrap"><table className="late-table"><thead><tr><th>Type</th><th>Store / Account</th><th>Order</th><th>Dates</th><th>Delay</th><th>Late Reason</th><th>Remarks</th><th /></tr></thead><tbody>{orders.map((order) => {
      const key = orderKey(order.dashboardType, order.orderNumber);
      const edit = edits[key];
      const reason = edit?.reason ?? order.reason;
      const remarks = edit?.remarks ?? order.remarks;
      return <tr key={key}><td><span className={`type-badge type-${order.dashboardType.toLowerCase()}`}>{order.dashboardType}</span></td><td><strong>{order.name}</strong><small>{order.group}</small></td><td><code>{order.orderNumber}</code></td><td><span>{formatDate(order.orderDate)} → {formatDate(order.shippedDate)}</span></td><td><span className="delay-badge">{order.businessDays} days</span></td><td><select aria-label={`Late reason for ${order.orderNumber}`} value={reason} onChange={(event) => onPatch(order, "reason", event.target.value)}><option value="">Select reason</option>{LATE_REASON_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></td><td><input aria-label={`Remarks for ${order.orderNumber}`} value={remarks} placeholder={compact ? "Add note" : "Add context for the team"} onChange={(event) => onPatch(order, "remarks", event.target.value)} /></td><td><button className={`save-row ${savedKey === key ? "saved" : ""}`} aria-label={`Save ${order.orderNumber}`} onClick={() => void onSave(order)} disabled={savingKey === key}>{savingKey === key ? <RefreshCw className="spin" size={16} /> : savedKey === key ? <Check size={16} /> : <Save size={16} />}</button></td></tr>;
    })}</tbody></table></div>
  );
}
