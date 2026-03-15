import { drizzle } from "drizzle-orm/d1";

// Placeholder for CLI compatibility.
// In production, the D1 binding is provided by Cloudflare Workers runtime.
export const db = drizzle(undefined as unknown as D1Database);
