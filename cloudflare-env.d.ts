interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
}

interface R2PutOptions {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | Blob, options?: R2PutOptions): Promise<unknown>;
}

interface Fetcher {
  fetch(input: Request): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
