import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    externalMessageId: text("external_message_id").notNull(),
    channel: text("channel").notNull(),
    rawMessage: text("raw_message").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    unique("captures_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("captures_workspace_channel_message_uq").on(
      table.workspaceId,
      table.channel,
      table.externalMessageId
    ),
    check("captures_channel_check", sql`${table.channel} in ('telegram')`),
    check("captures_status_check", sql`${table.status} in ('received', 'processed', 'rejected')`),
    check("captures_raw_message_check", sql`length(trim(${table.rawMessage})) > 0`)
  ]
);

export const confirmationPolicies = pgTable(
  "confirmation_policies",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    channel: text("channel").notNull(),
    mode: text("mode").notNull(),
    confidenceThreshold: numeric("confidence_threshold", { precision: 5, scale: 4 }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("confirmation_policies_workspace_channel_uq").on(
      table.workspaceId,
      table.channel
    ),
    check("confirmation_policies_channel_check", sql`${table.channel} in ('telegram')`),
    check(
      "confirmation_policies_mode_check",
      sql`${table.mode} in ('always_confirm', 'confidence_based', 'never_confirm')`
    ),
    check(
      "confirmation_policies_threshold_check",
      sql`(
        ${table.mode} = 'confidence_based'
        and ${table.confidenceThreshold} between 0 and 1
      ) or (
        ${table.mode} <> 'confidence_based'
        and ${table.confidenceThreshold} is null
      )`
    ),
    check("confirmation_policies_version_check", sql`${table.version} > 0`)
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    captureId: uuid("capture_id").notNull(),
    transactionType: text("transaction_type").notNull(),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    currency: text("currency").notNull(),
    concept: text("concept").notNull(),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: "transactions_workspace_capture_fk",
      columns: [table.workspaceId, table.captureId],
      foreignColumns: [captures.workspaceId, captures.id]
    }).onDelete("restrict"),
    uniqueIndex("transactions_capture_uq").on(table.captureId),
    check("transactions_type_check", sql`${table.transactionType} = 'expense'`),
    check("transactions_amount_check", sql`${table.amount} > 0`),
    check("transactions_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("transactions_concept_check", sql`length(trim(${table.concept})) > 0`),
    check("transactions_payment_method_check", sql`length(trim(${table.paymentMethod})) > 0`),
    check(
      "transactions_status_check",
      sql`${table.status} in ('registered', 'pending_confirmation', 'cancelled')`
    ),
    check("transactions_confidence_check", sql`${table.confidence} between 0 and 1`)
  ]
);
