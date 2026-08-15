import type { DashboardData } from "./dashboard-types";

export const sampleDashboard: DashboardData = {
  meta: {
    title: "Zepp Health Shipping Performance Dashboard",
    reportLabel: "Week 30 · Aug 2–Aug 8, 2026",
    sourceFilename: "Sample view — upload the latest workbook to publish live data",
    parsedAt: "",
  },
  dtc: {
    kpis: {
      reportWeekOrders: 511,
      onTimeRate: 0.984,
      lateOrders: 8,
      ytdOrders: 20026,
      ytdOnTimeRate: 0.941,
    },
    shippingGroups: [
      { label: "0–1 Business Day", orders: 503, share: 0.984, status: "On Time" },
      { label: "2 Business Days", orders: 6, share: 0.012, status: "Late" },
      { label: "3 Business Days", orders: 1, share: 0.002, status: "Late" },
      { label: "4+ Business Days", orders: 1, share: 0.002, status: "Late" },
    ],
    monthly: [
      { label: "Jan", value: 2831 }, { label: "Feb", value: 2226 },
      { label: "Mar", value: 2742 }, { label: "Apr", value: 2085 },
      { label: "May", value: 1857 }, { label: "Jun", value: 4619 },
      { label: "Jul", value: 3155 }, { label: "Aug", value: 511 },
    ],
    weekly: [
      { label: "Jul 12–18", value: 706 }, { label: "Jul 19–25", value: 664 },
      { label: "Jul 26–Aug 1", value: 502 }, { label: "Aug 2–8", value: 511 },
    ],
    trend: [
      { label: "Jul 12–18", total: 706, onTime: 682, late1: 15, late2: 5, late3: 4, onTimeRate: .966 },
      { label: "Jul 19–25", total: 664, onTime: 625, late1: 24, late2: 9, late3: 6, onTimeRate: .941 },
      { label: "Jul 26–Aug 1", total: 502, onTime: 476, late1: 16, late2: 7, late3: 3, onTimeRate: .948 },
      { label: "Aug 2–8", total: 511, onTime: 503, late1: 6, late2: 1, late3: 1, onTimeRate: .984 },
    ],
    performance: [
      { name: "Best Buy Marketplace", shippedOrders: 5, onTimeRate: 0, lateOrders: 5, severeLate: 0 },
      { name: "Amazfit Store", shippedOrders: 468, onTimeRate: .994, lateOrders: 3, severeLate: 1 },
      { name: "Zepp Clarity Store", shippedOrders: 28, onTimeRate: 1, lateOrders: 0, severeLate: 0 },
      { name: "Premstar", shippedOrders: 6, onTimeRate: 1, lateOrders: 0, severeLate: 0 },
      { name: "Target DVS", shippedOrders: 2, onTimeRate: 1, lateOrders: 0, severeLate: 0 },
    ],
    lateOrders: [],
  },
  b2b: {
    kpis: {
      reportWeekOrders: 56,
      reportWeekUnits: 1942,
      evaluatedOrders: 56,
      onTimeRate: .964,
      lateOrders: 2,
      ytdOrders: 1579,
      ytdOnTimeRate: .884,
    },
    monthly: [
      { label: "Jan", value: 241 }, { label: "Feb", value: 186 },
      { label: "Mar", value: 263 }, { label: "Apr", value: 209 },
      { label: "May", value: 224 }, { label: "Jun", value: 221 },
      { label: "Jul", value: 179 }, { label: "Aug", value: 56 },
    ],
    weekly: [
      { label: "Jul 12–18", value: 72 }, { label: "Jul 19–25", value: 41 },
      { label: "Jul 26–Aug 1", value: 30 }, { label: "Aug 2–8", value: 56 },
    ],
    trend: [
      { label: "Jul 12–18", total: 72, onTime: 72, late1: 0, late2: 0, late3: 0, onTimeRate: 1 },
      { label: "Jul 19–25", total: 41, onTime: 41, late1: 0, late2: 0, late3: 0, onTimeRate: 1 },
      { label: "Jul 26–Aug 1", total: 30, onTime: 30, late1: 0, late2: 0, late3: 0, onTimeRate: 1 },
      { label: "Aug 2–8", total: 56, onTime: 54, late1: 0, late2: 0, late3: 2, onTimeRate: .964 },
    ],
    performance: [
      { name: "Best Buy", shippedOrders: 2, units: 530, slaDays: 7, onTimeRate: 0, lateOrders: 2, severeLate: 2, ytdOrders: 182, ytdOnTimeRate: .978 },
      { name: "Target", shippedOrders: 25, units: 560, slaDays: 5, onTimeRate: 1, lateOrders: 0, severeLate: 0, ytdOrders: 815, ytdOnTimeRate: .898 },
      { name: "Amazon", shippedOrders: 0, units: 0, slaDays: null, onTimeRate: null, lateOrders: null, severeLate: 0, ytdOrders: 62, ytdOnTimeRate: null },
      { name: "Walmart", shippedOrders: 29, units: 852, slaDays: 7, onTimeRate: 1, lateOrders: 0, severeLate: 0, ytdOrders: 445, ytdOnTimeRate: .753 },
      { name: "REI", shippedOrders: 0, units: 0, slaDays: null, onTimeRate: null, lateOrders: null, severeLate: 0, ytdOrders: 75, ytdOnTimeRate: null },
    ],
    lateOrders: [],
  },
};
