import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    authUserId: uuid("auth_user_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.authUserId, table.workspaceId],
      name: "workspace_memberships_auth_user_workspace_pk"
    })
  ]
);

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
    check("captures_channel_check", sql`${table.channel} in ('telegram', 'bank_sms')`),
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

export const bankSmsDeviceCredentials = pgTable(
  "bank_sms_device_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    deviceLabel: text("device_label").notNull(),
    tokenHash: text("token_hash").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    unique("bank_sms_device_credentials_token_hash_uq").on(table.tokenHash),
    check("bank_sms_device_credentials_label_check", sql`length(trim(${table.deviceLabel})) > 0`),
    check(
      "bank_sms_device_credentials_token_hash_check",
      sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "bank_sms_device_credentials_state_check",
      sql`(${table.active} and ${table.revokedAt} is null) or (not ${table.active} and ${table.revokedAt} is not null)`
    )
  ]
);

export const bankSmsTemplates = pgTable(
  "bank_sms_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    version: text("version").notNull(),
    paymentMethod: text("payment_method").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    unique("bank_sms_templates_workspace_version_uq").on(table.workspaceId, table.version),
    uniqueIndex("bank_sms_templates_workspace_active_uq")
      .on(table.workspaceId)
      .where(sql`${table.active}`),
    check("bank_sms_templates_sender_check", sql`${table.sender} ~ '^\\+[1-9][0-9]{1,14}$'`),
    check("bank_sms_templates_body_check", sql`length(trim(${table.body})) > 0`),
    check("bank_sms_templates_version_check", sql`length(trim(${table.version})) > 0`),
    check(
      "bank_sms_templates_payment_method_check",
      sql`length(trim(${table.paymentMethod})) > 0`
    )
  ]
);

export const bankSmsCaptureAudits = pgTable(
  "bank_sms_capture_audits",
  {
    captureId: uuid("capture_id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    messageHash: text("message_hash").notNull(),
    templateId: uuid("template_id").notNull(),
    templateVersion: text("template_version").notNull(),
    credentialId: uuid("credential_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: "bank_sms_capture_audits_workspace_capture_fk",
      columns: [table.workspaceId, table.captureId],
      foreignColumns: [captures.workspaceId, captures.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "bank_sms_capture_audits_template_fk",
      columns: [table.templateId],
      foreignColumns: [bankSmsTemplates.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "bank_sms_capture_audits_credential_fk",
      columns: [table.credentialId],
      foreignColumns: [bankSmsDeviceCredentials.id]
    }).onDelete("restrict"),
    check("bank_sms_capture_audits_hash_check", sql`${table.messageHash} ~ '^sha256:v1:[a-f0-9]{64}$'`),
    check("bank_sms_capture_audits_template_version_check", sql`length(trim(${table.templateVersion})) > 0`)
  ]
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    unique("payment_methods_workspace_code_uq").on(table.workspaceId, table.code),
    unique("payment_methods_workspace_label_uq").on(table.workspaceId, table.label),
    check("payment_methods_code_check", sql`length(trim(${table.code})) > 0`),
    check("payment_methods_label_check", sql`length(trim(${table.label})) > 0`)
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
    foreignKey({
      name: "transactions_workspace_payment_method_fk",
      columns: [table.workspaceId, table.paymentMethod],
      foreignColumns: [paymentMethods.workspaceId, paymentMethods.code]
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
