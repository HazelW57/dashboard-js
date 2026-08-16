import { mkdir, writeFile } from "node:fs/promises";

const API_BASE = "https://api.shipstation.com/v2";
const apiKey = process.env.SHIPSTATION_API_KEY?.trim();
const syncToken = process.env.DASHBOARD_SYNC_TOKEN?.trim();
const dryRun = process.env.SYNC_DRY_RUN === "1";
const dashboardUrl = (process.env.SYNC_DASHBOARD_URL || "https://dashboard.jiantsolutions.com").replace(/\/$/, "");
if (!apiKey) throw new Error("SHIPSTATION_API_KEY is required");
if (!syncToken && !dryRun) throw new Error("DASHBOARD_SYNC_TOKEN is required");

const STORE_ID_FALLBACK = {
  "se-255221": "Walmart",
  "se-276827": "D&H - US/CA",
  "se-248381": "Amazon DVS",
  "se-239045": "Warranty",
  "se-211203": "Amazfit-USA",
  "se-271710": "Premstar",
  "se-247490": "Target DVS",
  "se-249099": "Zepp Clarity Store USA",
  "se-69423": "Manual Orders",
  "se-274507": "Best Buy Marketplace",
  "se-276826": "ExpertVoice",
  "se-255101": "Target Stores",
  "se-215821": "Amazfit -Amazon",
  "se-255102": "Best Buy",
  "se-276825": "Microcenter",
};

const DTC_STORES = new Map(Object.entries({
  "amazfit-usa": "Amazfit Store",
  "zepp clarity store usa": "Zepp Clarity Store",
  "target dvs": "Target DVS",
  "amazfit -amazon": "Amazon SC Direct Order",
  "best buy marketplace": "Best Buy Marketplace",
  "zepp ebay store": "Ebay Store",
  "expertvoice": "ExpertVoice",
  "premstar": "Premstar",
  "walmart marketplace (manual)": "Walmart Marketplace",
  "new walmart store": "Walmart Marketplace",
  "amazon dvs": "Amazon VC DVS",
  "qvc via orderstream": "QVC via Orderstream",
}));

const B2B_ACCOUNTS = [
  { name: "Best Buy", stores: ["best buy"], slaDays: 7 },
  { name: "Target", stores: ["target stores"], slaDays: 5 },
  { name: "Amazon", stores: ["amazon vc"], slaDays: 7 },
  { name: "Walmart", stores: ["walmart"], slaDays: 7 },
  { name: "REI", stores: ["manual orders"], buyerIncludes: "rei", slaDays: 7 },
];

const pad = (value) => String(value).padStart(2, "0");
const iso = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const fromIso = (value) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const addDays = (value, days) => {
  const date = typeof value === "string" ? fromIso(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};
const daysBetween = (start, end) => Math.max(0, Math.round((fromIso(end) - fromIso(start)) / 86_400_000));
const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const text = (value) => String(value ?? "").trim();

const pacificFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function pacificDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(pacificFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function nthWeekday(year, monthIndex, weekday, occurrence) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return iso(new Date(Date.UTC(year, monthIndex, 1 + offset + (occurrence - 1) * 7)));
}

function lastWeekday(year, monthIndex, weekday) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return iso(new Date(Date.UTC(year, monthIndex, last.getUTCDate() - offset)));
}

function observedFixedHoliday(year, monthIndex, day) {
  const actual = new Date(Date.UTC(year, monthIndex, day));
  const observed = new Date(actual);
  if (actual.getUTCDay() === 6) observed.setUTCDate(day - 1);
  if (actual.getUTCDay() === 0) observed.setUTCDate(day + 1);
  return [iso(actual), iso(observed)];
}

function holidaySetForYears(startYear, endYear) {
  const holidays = new Set();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const [month, day] of [[0, 1], [5, 19], [6, 4], [10, 11], [11, 25]]) {
      for (const value of observedFixedHoliday(year, month, day)) holidays.add(value);
    }
    holidays.add(nthWeekday(year, 0, 1, 3));
    holidays.add(nthWeekday(year, 1, 1, 3));
    holidays.add(lastWeekday(year, 4, 1));
    holidays.add(nthWeekday(year, 8, 1, 1));
    holidays.add(nthWeekday(year, 9, 1, 2));
    const thanksgiving = nthWeekday(year, 10, 4, 4);
    holidays.add(thanksgiving);
    holidays.add(addDays(thanksgiving, 1));
    holidays.add(`${year}-03-31`);
  }
  return holidays;
}

function businessDays(orderDate, shipDate) {
  if (!orderDate || !shipDate || shipDate <= orderDate) return 0;
  const holidays = holidaySetForYears(Number(orderDate.slice(0, 4)), Number(shipDate.slice(0, 4)));
  let count = 0;
  for (let cursor = addDays(orderDate, 1); cursor <= shipDate; cursor = addDays(cursor, 1)) {
    const weekday = fromIso(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(cursor)) count += 1;
  }
  return count;
}

function nextBusinessDay(orderDate) {
  const year = Number(orderDate.slice(0, 4));
  const holidays = holidaySetForYears(year, year + 1);
  let cursor = addDays(orderDate, 1);
  while ([0, 6].includes(fromIso(cursor).getUTCDay()) || holidays.has(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

async function apiFetch(path, params = {}, attempt = 1) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value != null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { "api-key": apiKey, accept: "application/json" } });
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(16_000, 750 * 2 ** attempt)));
    return apiFetch(path, params, attempt + 1);
  }
  if (!response.ok) throw new Error(`ShipStation ${path} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function fetchCollection(path, params, key, pageSize) {
  const first = await apiFetch(path, { ...params, page: 1, page_size: pageSize });
  const rows = [...(first[key] ?? [])];
  const pages = Number(first.pages || 1);
  for (let page = 2; page <= pages; page += 6) {
    const batch = await Promise.all(Array.from(
      { length: Math.min(6, pages - page + 1) },
      (_, index) => apiFetch(path, { ...params, page: page + index, page_size: pageSize }),
    ));
    for (const payload of batch) rows.push(...(payload[key] ?? []));
  }
  return rows;
}

async function fetchStores() {
  try {
    const rows = await fetchCollection("/stores", {}, "stores", 100);
    return Object.fromEntries(rows.flatMap((store) => {
      const id = text(store.store_id ?? store.order_source_id);
      const name = text(store.name ?? store.store_name);
      return id && name ? [[id, name]] : [];
    }));
  } catch {
    return {};
  }
}

async function fetchShipments(createdStart, createdEnd) {
  const rows = [];
  for (let cursor = createdStart; cursor <= createdEnd;) {
    const next = addDays(cursor, 14);
    const chunkEnd = next <= createdEnd ? addDays(next, -1) : createdEnd;
    rows.push(...await fetchCollection("/shipments", {
      shipment_status: "label_purchased",
      created_at_start: `${cursor}T00:00:00Z`,
      created_at_end: `${chunkEnd}T23:59:59Z`,
      sort_by: "created_at",
      sort_dir: "asc",
    }, "shipments", 100));
    cursor = addDays(chunkEnd, 1);
  }
  return rows;
}

async function fetchFulfillments(shipStart, shipEnd) {
  const rows = [];
  for (let cursor = shipStart; cursor <= shipEnd;) {
    const next = addDays(cursor, 31);
    const chunkEnd = next <= shipEnd ? addDays(next, -1) : shipEnd;
    rows.push(...await fetchCollection("/fulfillments", {
      ship_date_start: `${cursor}T00:00:00Z`,
      ship_date_end: `${chunkEnd}T23:59:59Z`,
      sort_by: "created_at",
      sort_dir: "asc",
    }, "fulfillments", 500));
    cursor = addDays(chunkEnd, 1);
  }
  return rows;
}

function quantity(items) {
  const total = (items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? item.quantity_shipped ?? 0), 0);
  return Number.isFinite(total) ? total : 0;
}

function classify(rawStore, buyer) {
  const storeKey = normalize(rawStore);
  for (const account of B2B_ACCOUNTS) {
    if (!account.stores.includes(storeKey)) continue;
    if (account.buyerIncludes && !normalize(buyer).includes(account.buyerIncludes)) continue;
    return { sourceType: "B2B", name: account.name, slaDays: account.slaDays };
  }
  const dtcName = DTC_STORES.get(storeKey);
  return dtcName
    ? { sourceType: "DTC", name: dtcName, slaDays: null }
    : { sourceType: "Out of Scope", name: rawStore || "Unknown", slaDays: null };
}

function mergeRawOrders(shipments, fulfillments, storeNames, fulfillmentDetails) {
  const grouped = new Map();
  function add(row, detail = null, isFulfillment = false) {
    const orderNumber = text(row.shipment_number ?? detail?.shipment_number);
    const shipDate = text(row.ship_date ?? detail?.ship_date).slice(0, 10);
    if (!orderNumber || !shipDate) return;
    const storeId = text(row.store_id ?? row.order_source_id ?? detail?.store_id);
    const shipTo = row.ship_to ?? detail?.ship_to ?? {};
    const orderDateValue = detail?.payment_date ?? row.payment_date ?? detail?.created_at ?? row.created_at;
    const current = grouped.get(orderNumber) ?? {
      orderNumber,
      rawStore: storeNames[storeId] ?? STORE_ID_FALLBACK[storeId] ?? storeId,
      buyer: text(shipTo.name ?? row.ship_to_name),
      orderDate: pacificDay(orderDateValue),
      shipDate,
      units: 0,
      source: isFulfillment ? "fulfillment" : "shipment",
    };
    if (!current.rawStore) current.rawStore = storeNames[storeId] ?? STORE_ID_FALLBACK[storeId] ?? storeId;
    if (!current.buyer) current.buyer = text(shipTo.name ?? row.ship_to_name);
    const candidateOrderDate = pacificDay(orderDateValue);
    if (candidateOrderDate && (!current.orderDate || candidateOrderDate < current.orderDate)) current.orderDate = candidateOrderDate;
    if (shipDate < current.shipDate) current.shipDate = shipDate;
    current.units += quantity(row.items ?? detail?.items);
    grouped.set(orderNumber, current);
  }
  for (const shipment of shipments) add(shipment);
  for (const fulfillment of fulfillments) {
    const orderNumber = text(fulfillment.shipment_number);
    if (grouped.has(orderNumber)) continue;
    add(fulfillment, fulfillmentDetails.get(text(fulfillment.shipment_id)), true);
  }
  return [...grouped.values()].map((row) => {
    const classification = classify(row.rawStore, row.buyer);
    const calendarDays = row.orderDate ? daysBetween(row.orderDate, row.shipDate) : 0;
    const processingDays = row.orderDate ? businessDays(row.orderDate, row.shipDate) : 0;
    const target = row.orderDate ? nextBusinessDay(row.orderDate) : row.shipDate;
    const onTime = row.orderDate ? row.shipDate <= target : false;
    const timeGroup = onTime ? "0–1 Business Day" : processingDays === 2 ? "2 Business Days" : processingDays === 3 ? "3 Business Days" : "4+ Business Days";
    return { ...row, ...classification, units: row.units || 1, calendarDays, processingDays, onTime, timeGroup };
  });
}

function pct(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function inRange(order, start, end) {
  return order.shipDate >= start && order.shipDate <= end;
}

function formatRange(start, end, includeYear = false) {
  const startDate = fromIso(start);
  const endDate = fromIso(end);
  const startMonth = startDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = endDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const core = `${startMonth} ${startDate.getUTCDate()}–${endMonth} ${endDate.getUTCDate()}`;
  return includeYear ? `${core}, ${endDate.getUTCFullYear()}` : core;
}

function monthSeries(orders, year, lastMonth) {
  return Array.from({ length: lastMonth + 1 }, (_, month) => ({
    label: new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    value: orders.filter((order) => Number(order.shipDate.slice(0, 4)) === year && Number(order.shipDate.slice(5, 7)) === month + 1).length,
  }));
}

function weekStarts(reportStart) {
  return [3, 2, 1, 0].map((offset) => addDays(reportStart, -7 * offset));
}

function shippingTrend(orders, reportStart, b2b = false) {
  return weekStarts(reportStart).map((start) => {
    const end = addDays(start, 6);
    const rows = orders.filter((order) => inRange(order, start, end));
    if (b2b) {
      const onTime = rows.filter((order) => order.calendarDays <= order.slaDays).length;
      const over = rows.map((order) => Math.max(0, order.calendarDays - order.slaDays));
      return {
        label: formatRange(start, end), total: rows.length, onTime,
        late1: over.filter((days) => days >= 1 && days <= 2).length,
        late2: over.filter((days) => days >= 3 && days <= 5).length,
        late3: over.filter((days) => days >= 6).length,
        onTimeRate: pct(onTime, rows.length),
      };
    }
    const onTime = rows.filter((order) => order.onTime).length;
    return {
      label: formatRange(start, end), total: rows.length, onTime,
      late1: rows.filter((order) => order.processingDays === 2).length,
      late2: rows.filter((order) => order.processingDays === 3).length,
      late3: rows.filter((order) => order.processingDays >= 4).length,
      onTimeRate: pct(onTime, rows.length),
    };
  });
}

function lateOrder(row, dashboardType) {
  return {
    dashboardType,
    name: row.name,
    orderNumber: row.orderNumber,
    orderDate: row.orderDate,
    shippedDate: row.shipDate,
    businessDays: dashboardType === "DTC" ? row.processingDays : row.calendarDays,
    calendarDays: row.calendarDays,
    slaDays: dashboardType === "B2B" ? row.slaDays : null,
    group: dashboardType === "DTC" ? row.timeGroup : `${Math.max(0, row.calendarDays - row.slaDays)} Days Over SLA`,
    reason: "",
    remarks: "",
  };
}

function buildDashboard(orders, reportStart, reportEnd, sourceFilename) {
  const year = Number(reportEnd.slice(0, 4));
  const ytdStart = `${year}-01-01`;
  const dtcYtd = orders.filter((order) => order.sourceType === "DTC" && inRange(order, ytdStart, reportEnd));
  const b2bYtd = orders.filter((order) => order.sourceType === "B2B" && inRange(order, ytdStart, reportEnd));
  const dtcWeek = dtcYtd.filter((order) => inRange(order, reportStart, reportEnd));
  const b2bWeek = b2bYtd.filter((order) => inRange(order, reportStart, reportEnd));
  const fourWeekStart = addDays(reportStart, -21);
  const dtcFourWeekLate = dtcYtd.filter((order) => inRange(order, fourWeekStart, reportEnd) && !order.onTime)
    .sort((left, right) => right.processingDays - left.processingDays || left.shipDate.localeCompare(right.shipDate));
  const b2bFourWeekLate = b2bYtd.filter((order) => inRange(order, fourWeekStart, reportEnd) && order.calendarDays > order.slaDays)
    .sort((left, right) => (right.calendarDays - right.slaDays) - (left.calendarDays - left.slaDays) || left.shipDate.localeCompare(right.shipDate));
  const dtcOnTime = dtcWeek.filter((order) => order.onTime).length;
  const b2bOnTime = b2bWeek.filter((order) => order.calendarDays <= order.slaDays).length;
  const dtcYtdOnTime = dtcYtd.filter((order) => order.onTime).length;
  const b2bYtdOnTime = b2bYtd.filter((order) => order.calendarDays <= order.slaDays).length;
  const lastMonth = Number(reportEnd.slice(5, 7)) - 1;
  const dtcTrend = shippingTrend(dtcYtd, reportStart);
  const b2bTrend = shippingTrend(b2bYtd, reportStart, true);
  const groups = ["0–1 Business Day", "2 Business Days", "3 Business Days", "4+ Business Days"].map((label) => {
    const count = dtcWeek.filter((order) => order.timeGroup === label).length;
    return { label, orders: count, share: pct(count, dtcWeek.length), status: label === "0–1 Business Day" ? "On Time" : "Late" };
  });
  const dtcStoreNames = [...new Set(dtcWeek.map((order) => order.name))];
  const dtcPerformance = dtcStoreNames.map((name) => {
    const rows = dtcWeek.filter((order) => order.name === name);
    const onTime = rows.filter((order) => order.onTime).length;
    return {
      name, shippedOrders: rows.length, onTimeRate: pct(onTime, rows.length), lateOrders: rows.length - onTime,
      severeLate: rows.filter((order) => order.processingDays >= 4).length,
    };
  }).sort((left, right) => right.lateOrders - left.lateOrders || right.shippedOrders - left.shippedOrders || left.name.localeCompare(right.name));
  const b2bPerformance = B2B_ACCOUNTS.map((account) => {
    const rows = b2bWeek.filter((order) => order.name === account.name);
    const ytdRows = b2bYtd.filter((order) => order.name === account.name);
    const onTime = rows.filter((order) => order.calendarDays <= account.slaDays).length;
    const ytdOnTime = ytdRows.filter((order) => order.calendarDays <= account.slaDays).length;
    return {
      name: account.name, slaDays: account.slaDays, shippedOrders: rows.length,
      units: rows.reduce((sum, order) => sum + order.units, 0), onTimeRate: pct(onTime, rows.length),
      lateOrders: rows.length - onTime, severeLate: rows.filter((order) => order.calendarDays - account.slaDays >= 6).length,
      ytdOrders: ytdRows.length, ytdOnTimeRate: pct(ytdOnTime, ytdRows.length),
    };
  });
  const dayOfYear = Math.floor((fromIso(reportStart) - new Date(Date.UTC(year, 0, 1))) / 86_400_000) + 1;
  const weekNumber = Math.floor((dayOfYear - 1) / 7);
  const reportLabel = `Week ${weekNumber} · ${formatRange(reportStart, reportEnd, true)}`;
  return {
    meta: { title: "Zepp Health Shipping Performance Dashboard", reportLabel, sourceFilename, parsedAt: new Date().toISOString() },
    dtc: {
      kpis: {
        reportWeekOrders: dtcWeek.length, onTimeRate: pct(dtcOnTime, dtcWeek.length), lateOrders: dtcWeek.length - dtcOnTime,
        ytdOrders: dtcYtd.length, ytdOnTimeRate: pct(dtcYtdOnTime, dtcYtd.length),
      },
      shippingGroups: groups,
      monthly: monthSeries(dtcYtd, year, lastMonth),
      weekly: dtcTrend.map(({ label, total }) => ({ label, value: total })),
      trend: dtcTrend,
      performance: dtcPerformance,
      lateOrders: dtcFourWeekLate.map((order) => lateOrder(order, "DTC")),
    },
    b2b: {
      kpis: {
        reportWeekOrders: b2bWeek.length,
        reportWeekUnits: b2bWeek.reduce((sum, order) => sum + order.units, 0),
        evaluatedOrders: b2bWeek.length, onTimeRate: pct(b2bOnTime, b2bWeek.length), lateOrders: b2bWeek.length - b2bOnTime,
        ytdOrders: b2bYtd.length, ytdOnTimeRate: pct(b2bYtdOnTime, b2bYtd.length),
      },
      monthly: monthSeries(b2bYtd, year, lastMonth),
      weekly: b2bTrend.map(({ label, total }) => ({ label, value: total })),
      trend: b2bTrend,
      performance: b2bPerformance,
      lateOrders: b2bFourWeekLate.map((order) => lateOrder(order, "B2B")),
    },
  };
}

function csvEscape(value) {
  const output = String(value ?? "");
  return /[",\n\r]/.test(output) ? `"${output.replaceAll('"', '""')}"` : output;
}

function buildCsv(orders) {
  const headers = ["Order #", "Buyer", "Store", "Order Date", "Ship Date", "Quantity", "Status", "Dashboard Type", "Dashboard Name"];
  const rows = orders.map((order) => [
    order.orderNumber, order.buyer, order.rawStore, order.orderDate, order.shipDate, order.units, "Shipped", order.sourceType, order.name,
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function currentPacificDate() {
  return pacificDay(new Date().toISOString());
}

function targetWeekStart() {
  const explicit = process.env.SYNC_WEEK_START?.trim();
  if (explicit) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit) || fromIso(explicit).getUTCDay() !== 0) {
      throw new Error("SYNC_WEEK_START must be a Sunday in YYYY-MM-DD format");
    }
    return explicit;
  }
  const today = currentPacificDate();
  return addDays(today, -fromIso(today).getUTCDay() - 7);
}

const reportStart = targetWeekStart();
const reportEnd = addDays(reportStart, 6);
const year = Number(reportEnd.slice(0, 4));
const ytdStart = `${year}-01-01`;
const createdStart = addDays(ytdStart, -120);
const [storeNames, shipments, fulfillments] = await Promise.all([
  fetchStores(),
  fetchShipments(createdStart, reportEnd),
  fetchFulfillments(ytdStart, reportEnd),
]);

const labelShipmentIds = new Set(shipments.map((shipment) => text(shipment.shipment_id)));
const missingFulfillments = fulfillments.filter((row) => !labelShipmentIds.has(text(row.shipment_id)));
const fulfillmentDetails = new Map();
for (let index = 0; index < missingFulfillments.length; index += 6) {
  const batch = await Promise.all(missingFulfillments.slice(index, index + 6).map(async (row) => {
    const id = text(row.shipment_id);
    if (!id) return [id, null];
    try {
      return [id, await apiFetch(`/shipments/${encodeURIComponent(id)}`)];
    } catch {
      return [id, null];
    }
  }));
  for (const [id, detail] of batch) if (id && detail) fulfillmentDetails.set(id, detail);
}

const allOrders = mergeRawOrders(shipments, fulfillments, storeNames, fulfillmentDetails);
const shippedOrders = allOrders.filter((order) => inRange(order, ytdStart, reportEnd));
const sourceFilename = `shipstation-shipped-${ytdStart}-to-${reportEnd}.csv`;
const rawCsv = buildCsv(shippedOrders);
const dashboard = buildDashboard(shippedOrders, reportStart, reportEnd, sourceFilename);

await mkdir("sync-output", { recursive: true });
await writeFile(`sync-output/${sourceFilename}`, rawCsv, "utf8");
let result = { snapshot: null };
if (!dryRun) {
  const response = await fetch(`${dashboardUrl}/api/automation/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${syncToken}`, "content-type": "application/json" },
    body: JSON.stringify({ dashboard, rawCsv, sourceFilename }),
  });
  if (!response.ok) throw new Error(`Dashboard sync failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  result = await response.json();
}
console.log(JSON.stringify({
  mode: dryRun ? "dry-run" : "sync",
  reportLabel: dashboard.meta.reportLabel,
  shippedRows: shippedOrders.length,
  dtcWeekOrders: dashboard.dtc.kpis.reportWeekOrders,
  b2bWeekOrders: dashboard.b2b.kpis.reportWeekOrders,
  snapshotKey: result.snapshot?.key,
}, null, 2));
