"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SerialAudit,
  SerialBulkScanRow,
  SerialImportRow,
  SerialOrderLine,
  SerialOrderSummary,
  SerialScan,
  SerialSection,
} from "../lib/serial-types";

type Summary = { openOrders: number; expectedUnits: number; scannedUnits: number; completedOrders: number };
type OrderDetail = { order: SerialOrderSummary; lines: SerialOrderLine[]; scans: SerialScan[] };

const numberFormat = new Intl.NumberFormat("en-US");
const formatDateTime = (value: string) => {
  if (!value) return "—";
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const text = (value: unknown) => String(value ?? "").trim();
const normalizeType = (value: unknown): "serial" | "carton" => text(value).toLowerCase() === "carton" ? "carton" : "serial";

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request could not be completed");
  return payload;
}

export function SerialCapture({
  section,
  onSectionChange,
  canEdit,
}: {
  section: SerialSection;
  onSectionChange: (section: SerialSection) => void;
  canEdit: boolean;
}) {
  const [orders, setOrders] = useState<SerialOrderSummary[]>([]);
  const [summary, setSummary] = useState<Summary>({ openOrders: 0, expectedUnits: 0, scannedUnits: 0, completedOrders: 0 });
  const [selectedOrderKey, setSelectedOrderKey] = useState("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [searchText, setSearchText] = useState("");
  const [activeSku, setActiveSku] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanType, setScanType] = useState<"serial" | "carton">("serial");
  const [cartonQuantity, setCartonQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<SerialScan[]>([]);
  const [audits, setAudits] = useState<SerialAudit[]>([]);
  const orderFileInput = useRef<HTMLInputElement>(null);
  const scanFileInput = useRef<HTMLInputElement>(null);
  const scanInput = useRef<HTMLInputElement>(null);

  async function loadOrders(selectFirst = false) {
    setLoading(true);
    try {
      const payload = await api("/api/serial-capture");
      setOrders(payload.orders ?? []);
      setSummary(payload.summary ?? { openOrders: 0, expectedUnits: 0, scannedUnits: 0, completedOrders: 0 });
      if (selectFirst && !selectedOrderKey && payload.orders?.length) setSelectedOrderKey(payload.orders[0].orderKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Serial Capture could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrder(key = selectedOrderKey) {
    if (!key) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const payload = await api(`/api/serial-capture?orderKey=${encodeURIComponent(key)}`);
      setDetail(payload);
      setCartonQuantity(payload.lines?.find((line: SerialOrderLine) => line.sku === activeSku)?.casePack ?? 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrders(true), 0);
    return () => window.clearTimeout(timer);
    // The initial fetch intentionally runs once when the workspace mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selectedOrderKey) void loadOrder(selectedOrderKey);
    }, 0);
    return () => window.clearTimeout(timer);
    // The selected key is the only trigger; loadOrder receives it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (section === "audit") void loadAudit();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [section]);

  const filteredOrders = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) => [order.orderNumber, order.poNumber, order.customerName]
      .some((value) => value.toLowerCase().includes(query)));
  }, [orders, searchText]);

  const activeLine = detail?.lines.find((line) => line.sku === activeSku) ?? null;
  const scanProgress = detail?.order.expectedUnits
    ? Math.min(100, Math.round((detail.order.scannedUnits / detail.order.expectedUnits) * 100))
    : 0;

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function chooseSku(value = skuInput) {
    clearFeedback();
    const normalized = value.trim().toLowerCase();
    const line = detail?.lines.find((candidate) =>
      candidate.sku.toLowerCase() === normalized || (candidate.upc && candidate.upc.toLowerCase() === normalized));
    if (!line) {
      setError("UPC or SKU is not on the selected order");
      return;
    }
    setActiveSku(line.sku);
    setSkuInput(line.upc || line.sku);
    setCartonQuantity(line.casePack || 1);
    window.setTimeout(() => scanInput.current?.focus(), 30);
  }

  async function submitScan() {
    if (!canEdit || !detail || !activeLine || !scanValue.trim()) return;
    clearFeedback();
    setWorking(true);
    try {
      const payload = await api("/api/serial-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "scan",
          orderKey: detail.order.orderKey,
          sku: activeLine.sku,
          value: scanValue.trim(),
          scanType,
          unitQuantity: scanType === "carton" ? cartonQuantity : 1,
        }),
      });
      setMessage(`${payload.subject} saved · ${payload.unitQuantity} unit${payload.unitQuantity === 1 ? "" : "s"}`);
      setScanValue("");
      await Promise.all([loadOrder(detail.order.orderKey), loadOrders()]);
      window.setTimeout(() => scanInput.current?.focus(), 30);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan could not be saved");
      window.setTimeout(() => scanInput.current?.select(), 30);
    } finally {
      setWorking(false);
    }
  }

  async function voidScan(scan: SerialScan) {
    if (!canEdit || !window.confirm(`Remove ${scan.serialNumber || scan.cartonNumber} from this order? The audit history will be kept.`)) return;
    clearFeedback();
    setWorking(true);
    try {
      await api("/api/serial-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "voidScan", id: scan.id }),
      });
      setMessage("Scan removed; audit history preserved");
      await Promise.all([loadOrder(), loadOrders()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan could not be removed");
    } finally {
      setWorking(false);
    }
  }

  async function setOrderStatus(status: "open" | "completed" | "hold") {
    if (!canEdit || !detail) return;
    setWorking(true);
    clearFeedback();
    try {
      await api("/api/serial-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setOrderStatus", orderKey: detail.order.orderKey, status }),
      });
      setMessage(`Order marked ${status}`);
      await Promise.all([loadOrder(), loadOrders()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order status could not be changed");
    } finally {
      setWorking(false);
    }
  }

  async function readWorkbook(file: File) {
    if (file.size > 20 * 1024 * 1024) throw new Error("Workbook must be 20 MB or smaller");
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("Workbook does not contain a worksheet");
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  }

  const cell = (row: Record<string, unknown>, names: string[]) => {
    const index = new Map(Object.keys(row).map((key) => [key.trim().toLowerCase(), key]));
    const key = names.map((name) => index.get(name.toLowerCase())).find(Boolean);
    return key ? row[key] : "";
  };

  async function importOrders(file?: File) {
    if (!file || !canEdit) return;
    setWorking(true);
    clearFeedback();
    try {
      const rawRows = await readWorkbook(file);
      const rows: SerialImportRow[] = rawRows.map((row) => ({
        orderNumber: text(cell(row, ["Order Number", "Order #", "Order"])),
        poNumber: text(cell(row, ["PO Number", "PO #", "PO"])),
        customerName: text(cell(row, ["Customer", "Customer Name", "Client"])),
        status: text(cell(row, ["Status", "Order Status"])) || "open",
        source: text(cell(row, ["Source"])) || "workbook",
        orderDate: text(cell(row, ["Order Date", "Date"])),
        sku: text(cell(row, ["SKU", "Item SKU"])),
        upc: text(cell(row, ["UPC", "Barcode"])),
        description: text(cell(row, ["Description", "Item Name", "Product"])),
        orderedQty: Number(cell(row, ["Ordered Qty", "Quantity", "Qty"])) || 0,
        casePack: Number(cell(row, ["Case Pack", "Case Qty", "Units Per Carton"])) || 1,
      })).filter((row) => row.orderNumber || row.sku);
      const payload = await api("/api/serial-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "importOrders", rows }),
      });
      setMessage(`${payload.importedOrders} orders and ${payload.importedLines} lines imported`);
      await loadOrders(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Orders could not be imported");
    } finally {
      setWorking(false);
      if (orderFileInput.current) orderFileInput.current.value = "";
    }
  }

  async function importScans(file?: File) {
    if (!file || !canEdit) return;
    setWorking(true);
    clearFeedback();
    try {
      const rawRows = await readWorkbook(file);
      const rows: SerialBulkScanRow[] = rawRows.map((row) => ({
        orderNumber: text(cell(row, ["Order Number", "Order #", "Order"])),
        sku: text(cell(row, ["SKU", "Item SKU"])),
        serialNumber: text(cell(row, ["Serial Number", "Serial", "IMEI"])),
        cartonNumber: text(cell(row, ["Carton Number", "Carton", "Carton QR"])),
        scanType: normalizeType(cell(row, ["Scan Type", "Type"])),
        unitQuantity: Number(cell(row, ["Unit Quantity", "Units", "Quantity"])) || undefined,
      })).filter((row) => row.orderNumber || row.sku || row.serialNumber || row.cartonNumber);
      let imported = 0;
      const rejected: string[] = [];
      for (let offset = 0; offset < rows.length; offset += 1000) {
        const payload = await api("/api/serial-capture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "bulkScan", rows: rows.slice(offset, offset + 1000) }),
        });
        imported += payload.imported ?? 0;
        rejected.push(...(payload.errors ?? []));
      }
      setMessage(`${imported} scans imported${rejected.length ? ` · ${rejected.length} rejected` : ""}`);
      if (rejected.length) setError(rejected.slice(0, 3).join("; "));
      await Promise.all([loadOrders(), selectedOrderKey ? loadOrder(selectedOrderKey) : Promise.resolve()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scans could not be imported");
    } finally {
      setWorking(false);
      if (scanFileInput.current) scanFileInput.current.value = "";
    }
  }

  async function downloadTemplate(kind: "orders" | "scans") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const rows = kind === "orders"
      ? [["Order Number", "PO Number", "Customer", "Status", "Order Date", "SKU", "UPC", "Description", "Ordered Qty", "Case Pack"],
          ["SO-10001", "PO-5001", "Example Customer", "open", "2026-10-09", "SKU-001", "123456789012", "Product name", 12, 6]]
      : [["Order Number", "SKU", "Serial Number", "Carton Number", "Scan Type", "Unit Quantity"],
          ["SO-10001", "SKU-001", "SN-000001", "", "serial", 1],
          ["SO-10001", "SKU-001", "", "CTN-0001", "carton", 6]];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0].map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(workbook, sheet, kind === "orders" ? "Orders" : "Serial Scans");
    XLSX.writeFile(workbook, kind === "orders" ? "Jiant-Serial-Order-Import.xlsx" : "Jiant-Serial-Bulk-Scan.xlsx", { compression: true });
  }

  async function exportOrder() {
    if (!detail) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const rows = detail.scans.filter((scan) => !scan.voided).map((scan) => ({
      "Order Number": detail.order.orderNumber,
      "PO Number": detail.order.poNumber,
      Customer: detail.order.customerName,
      SKU: scan.sku,
      "Scan Type": scan.scanType,
      "Serial Number": scan.serialNumber,
      "Carton Number": scan.cartonNumber,
      Units: scan.unitQuantity,
      "Scanned By": scan.scannedBy,
      "Scanned At": scan.scannedAt,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [18, 18, 24, 18, 12, 24, 24, 10, 18, 22].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, "Serials");
    XLSX.writeFile(workbook, `Jiant-Serials-${detail.order.orderNumber}.xlsx`, { compression: true });
  }

  async function runLookup() {
    if (lookupQuery.trim().length < 2) return;
    setWorking(true);
    clearFeedback();
    try {
      const payload = await api(`/api/serial-capture?mode=lookup&q=${encodeURIComponent(lookupQuery.trim())}`);
      setLookupResults(payload.results ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed");
    } finally {
      setWorking(false);
    }
  }

  async function loadAudit() {
    setLoading(true);
    try {
      const payload = await api("/api/serial-capture?mode=audit");
      setAudits(payload.audits ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Audit log could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="serial-content">
      <section className="serial-hero">
        <div>
          <span>WAREHOUSE OPERATIONS</span>
          <h2>Serial Capture</h2>
          <p>Import orders, scan unit serials or complete cartons, and keep one searchable audit trail in the dashboard.</p>
        </div>
        <div className="serial-hero-status"><i /><span>Central database</span><strong>Live</strong></div>
      </section>

      <section className="serial-kpis">
        <div><span>Open orders</span><strong>{numberFormat.format(summary.openOrders)}</strong><small>Ready to scan</small></div>
        <div><span>Expected units</span><strong>{numberFormat.format(summary.expectedUnits)}</strong><small>Across all orders</small></div>
        <div><span>Captured units</span><strong>{numberFormat.format(summary.scannedUnits)}</strong><small>Serials + cartons</small></div>
        <div><span>Completed</span><strong>{numberFormat.format(summary.completedOrders)}</strong><small>Quantity reached</small></div>
      </section>

      <div className="serial-section-tabs" role="tablist" aria-label="Serial Capture sections">
        {(["orders", "scan", "bulk", "lookup", "audit"] as SerialSection[]).map((item) => (
          <button key={item} className={section === item ? "active" : ""} onClick={() => onSectionChange(item)}>
            {item === "orders" ? "Orders" : item === "scan" ? "Capture" : item === "bulk" ? "Bulk upload" : item === "lookup" ? "Serial lookup" : "Audit log"}
          </button>
        ))}
      </div>

      {message && <div className="serial-notice success"><CheckCircle2 size={15} />{message}</div>}
      {error && <div className="serial-notice error"><AlertTriangle size={15} />{error}</div>}
      {loading && <div className="serial-loading"><RefreshCw size={16} className="spin" /> Loading Serial Capture…</div>}

      {!loading && section === "orders" && (
        <section className="serial-panel">
          <div className="serial-panel-head">
            <div><span>ORDER WORKBOOK</span><h3>Orders and capture progress</h3></div>
            <div className="serial-actions">
              <label className="serial-search"><Search size={15} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Order, PO, or customer" /></label>
              {canEdit && <>
                <button className="serial-secondary" onClick={() => void downloadTemplate("orders")}><Download size={15} /> Template</button>
                <label className="serial-primary"><Upload size={15} /> Import orders<input ref={orderFileInput} type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void importOrders(event.target.files?.[0])} /></label>
              </>}
            </div>
          </div>
          {!filteredOrders.length ? (
            <div className="serial-empty"><FileSpreadsheet size={30} /><strong>No serial orders yet</strong><span>Download the order template, complete it, and import it here.</span></div>
          ) : (
            <div className="table-scroll serial-table-wrap">
              <table className="serial-table">
                <thead><tr><th>Order</th><th>PO</th><th>Customer</th><th>SKUs</th><th>Expected</th><th>Captured</th><th>Progress</th><th>Status</th><th /></tr></thead>
                <tbody>{filteredOrders.map((order) => {
                  const progress = order.expectedUnits ? Math.min(100, Math.round((order.scannedUnits / order.expectedUnits) * 100)) : 0;
                  return <tr key={order.orderKey} className={selectedOrderKey === order.orderKey ? "selected" : ""}>
                    <td><strong>{order.orderNumber}</strong><small>{order.orderDate || "No order date"}</small></td>
                    <td>{order.poNumber || "—"}</td><td>{order.customerName || "—"}</td><td>{order.skuCount}</td><td>{order.expectedUnits}</td><td>{order.scannedUnits}</td>
                    <td><div className="serial-mini-progress"><span style={{ width: `${progress}%` }} /></div><small>{progress}%</small></td>
                    <td><span className={`serial-status ${order.status}`}>{order.status}</span></td>
                    <td><button className="serial-link" onClick={() => { setSelectedOrderKey(order.orderKey); onSectionChange("scan"); }}>Open capture</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!loading && section === "scan" && (
        <div className="serial-scan-layout">
          <section className="serial-panel serial-scan-card">
            <div className="serial-panel-head">
              <div><span>SCANNER WORKSPACE</span><h3>Capture serials and cartons</h3></div>
              <select value={selectedOrderKey} onChange={(event) => { setSelectedOrderKey(event.target.value); setActiveSku(""); setSkuInput(""); }}>
                <option value="">Select an order</option>
                {orders.map((order) => <option key={order.orderKey} value={order.orderKey}>{order.orderNumber} · {order.customerName || order.poNumber}</option>)}
              </select>
            </div>
            {!detail ? <div className="serial-empty compact"><PackageCheck size={28} /><strong>Select an order to begin</strong></div> : <>
              <div className="serial-order-strip">
                <div><span>Order</span><strong>{detail.order.orderNumber}</strong></div>
                <div><span>PO</span><strong>{detail.order.poNumber || "—"}</strong></div>
                <div><span>Customer</span><strong>{detail.order.customerName || "—"}</strong></div>
                <div><span>Captured</span><strong>{detail.order.scannedUnits} / {detail.order.expectedUnits}</strong></div>
              </div>
              <div className="serial-progress"><span style={{ width: `${scanProgress}%` }} /></div>
              <div className="scanner-fields">
                <label><span>1 · Scan UPC or enter SKU</span><div><ScanLine size={17} /><input value={skuInput} onChange={(event) => setSkuInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") chooseSku(); }} placeholder="Scan UPC, then press Enter" /></div></label>
                <label><span>2 · Capture type</span><div className="scan-type-toggle"><button className={scanType === "serial" ? "active" : ""} onClick={() => setScanType("serial")}>Unit serial</button><button className={scanType === "carton" ? "active" : ""} onClick={() => setScanType("carton")}>Carton</button></div></label>
                {scanType === "carton" && <label><span>Units in carton</span><input className="carton-qty" type="number" min="1" value={cartonQuantity} onChange={(event) => setCartonQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>}
                <label className="scan-value-field"><span>3 · Scan {scanType === "carton" ? "carton QR" : "serial number"}</span><div><ScanLine size={17} /><input ref={scanInput} value={scanValue} disabled={!activeLine || working} onChange={(event) => setScanValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitScan(); }} placeholder={activeLine ? `Capturing ${activeLine.sku}` : "Confirm a UPC / SKU first"} /><button disabled={!scanValue.trim() || !activeLine || working} onClick={() => void submitScan()}>{working ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />} Save</button></div></label>
              </div>
              <div className="serial-lines">
                {detail.lines.map((line) => <button key={line.sku} className={activeSku === line.sku ? "active" : ""} onClick={() => { setSkuInput(line.upc || line.sku); chooseSku(line.upc || line.sku); }}>
                  <span>{line.sku}<small>{line.description || line.upc || "No description"}</small></span><strong>{line.scannedQty} / {line.orderedQty}</strong>
                </button>)}
              </div>
            </>}
          </section>

          <section className="serial-panel recent-scans">
            <div className="serial-panel-head"><div><span>RECENT ACTIVITY</span><h3>Scans on this order</h3></div>{detail && <button className="serial-secondary" onClick={() => void exportOrder()}><Download size={15} /> Export</button>}</div>
            {!detail?.scans.filter((scan) => !scan.voided).length ? <div className="serial-empty compact"><History size={28} /><strong>No scans saved</strong></div> : <div className="serial-scan-list">
              {detail.scans.filter((scan) => !scan.voided).map((scan) => <div key={scan.id}>
                <i className={scan.scanType} /><span><strong>{scan.serialNumber || scan.cartonNumber}</strong><small>{scan.sku} · {scan.scanType === "carton" ? `${scan.unitQuantity} units` : "Unit serial"}</small></span>
                <time>{formatDateTime(scan.scannedAt)}<small>{scan.scannedBy}</small></time>
                {canEdit && <button aria-label="Remove scan" onClick={() => void voidScan(scan)}><Trash2 size={14} /></button>}
              </div>)}
            </div>}
            {detail && canEdit && <div className="serial-status-actions"><span>Order status</span><button onClick={() => void setOrderStatus("open")}>Open</button><button onClick={() => void setOrderStatus("hold")}>Hold</button><button onClick={() => void setOrderStatus("completed")}>Completed</button></div>}
          </section>
        </div>
      )}

      {!loading && section === "bulk" && (
        <section className="serial-panel serial-bulk-grid">
          <div className="serial-bulk-copy"><span>BULK SERIAL WORKFLOW</span><h3>Upload serials or complete cartons</h3><p>Use the template to update up to 1,000 rows per batch. Duplicates on the same order are rejected; accepted scans appear immediately in Capture and Lookup.</p><button className="serial-secondary" onClick={() => void downloadTemplate("scans")}><Download size={15} /> Download template</button></div>
          <label className={`serial-drop ${working ? "working" : ""}`}><Upload size={27} /><strong>{working ? "Processing workbook…" : "Upload completed workbook"}</strong><span>.xlsx, .xls, or .csv · 20 MB maximum</span><input ref={scanFileInput} type="file" accept=".xlsx,.xls,.csv" disabled={working || !canEdit} onChange={(event) => void importScans(event.target.files?.[0])} /></label>
        </section>
      )}

      {!loading && section === "lookup" && (
        <section className="serial-panel">
          <div className="serial-panel-head"><div><span>TRACEABILITY</span><h3>Serial and carton lookup</h3></div><form className="serial-lookup" onSubmit={(event) => { event.preventDefault(); void runLookup(); }}><Search size={16} /><input value={lookupQuery} onChange={(event) => setLookupQuery(event.target.value)} placeholder="Serial, carton, SKU, or order" /><button disabled={working || lookupQuery.trim().length < 2}>Search</button></form></div>
          {!lookupResults.length ? <div className="serial-empty"><Search size={30} /><strong>Search the complete scan history</strong><span>Results include active and voided records so traceability is never lost.</span></div> : <div className="table-scroll serial-table-wrap"><table className="serial-table"><thead><tr><th>Value</th><th>Type</th><th>Order</th><th>SKU</th><th>Units</th><th>Captured by</th><th>Captured at</th><th>Status</th></tr></thead><tbody>{lookupResults.map((scan) => <tr key={scan.id}><td><strong>{scan.serialNumber || scan.cartonNumber}</strong></td><td>{scan.scanType}</td><td>{scan.orderKey}</td><td>{scan.sku}</td><td>{scan.unitQuantity}</td><td>{scan.scannedBy}</td><td>{formatDateTime(scan.scannedAt)}</td><td><span className={`serial-status ${scan.voided ? "hold" : "open"}`}>{scan.voided ? "voided" : "active"}</span></td></tr>)}</tbody></table></div>}
        </section>
      )}

      {!loading && section === "audit" && (
        <section className="serial-panel">
          <div className="serial-panel-head"><div><span>IMMUTABLE HISTORY</span><h3>Serial Capture audit log</h3></div><button className="serial-secondary" onClick={() => void loadAudit()}><RefreshCw size={15} /> Refresh</button></div>
          {!audits.length ? <div className="serial-empty"><History size={30} /><strong>No activity recorded</strong></div> : <div className="serial-audit-list">{audits.map((audit) => <div key={audit.id}><i /><span><strong>{audit.action.replaceAll("_", " ")}</strong><small>{audit.subject || audit.orderKey || "Serial Capture"}</small></span><em>{audit.orderKey || "System"}</em><time>{formatDateTime(audit.createdAt)}<small>{audit.actor}</small></time></div>)}</div>}
        </section>
      )}
    </div>
  );
}
