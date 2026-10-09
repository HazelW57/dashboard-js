export type SerialSection = "orders" | "scan" | "bulk" | "lookup" | "audit";

export type SerialOrderSummary = {
  orderKey: string;
  orderNumber: string;
  poNumber: string;
  customerName: string;
  status: string;
  source: string;
  orderDate: string;
  expectedUnits: number;
  scannedUnits: number;
  skuCount: number;
  updatedAt: string;
};

export type SerialOrderLine = {
  id: number;
  orderKey: string;
  sku: string;
  upc: string;
  description: string;
  orderedQty: number;
  casePack: number;
  scannedQty: number;
};

export type SerialScan = {
  id: number;
  scanKey: string;
  orderKey: string;
  sku: string;
  serialNumber: string;
  cartonNumber: string;
  scanType: "serial" | "carton";
  unitQuantity: number;
  scannedBy: string;
  scannedAt: string;
  voided: boolean;
};

export type SerialAudit = {
  id: number;
  orderKey: string;
  action: string;
  subject: string;
  details: Record<string, unknown>;
  actor: string;
  createdAt: string;
};

export type SerialImportRow = {
  orderNumber: string;
  poNumber?: string;
  customerName?: string;
  status?: string;
  source?: string;
  orderDate?: string;
  sku: string;
  upc?: string;
  description?: string;
  orderedQty: number;
  casePack?: number;
};

export type SerialBulkScanRow = {
  orderNumber: string;
  sku: string;
  serialNumber?: string;
  cartonNumber?: string;
  scanType?: "serial" | "carton";
  unitQuantity?: number;
};
