import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

import { id, timestamps } from "./helper";

export const users = sqliteTable("users", {
  id,
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  ...timestamps,
});

export const sessions = sqliteTable(
  "sessions",
  {
    id,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id,
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    ...timestamps,
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id,
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const images = sqliteTable(
  "images",
  {
    id,
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    r2Key: text("r2_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    ...timestamps,
  },
  (table) => [index("images_createdAt_idx").on(table.createdAt)],
);
