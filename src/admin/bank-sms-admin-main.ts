import type { BankSmsCredentialRepository, BankSmsTemplateRepository } from "../application/ports.js";
import { createPostgresDatabase } from "../infrastructure/database/node-postgres.js";
import { DrizzleBankSmsCredentialRepository } from "../infrastructure/repositories/drizzle-bank-sms-credential-repository.js";
import { DrizzleBankSmsTemplateRepository } from "../infrastructure/repositories/drizzle-bank-sms-template-repository.js";
import { runBankSmsAdmin, type AdminCredentialStore, type AdminTemplateStore } from "./bank-sms-admin.js";

function credentials(repository: BankSmsCredentialRepository): AdminCredentialStore {
  return {
    create: (input) => repository.create({ workspaceId: input.workspaceId, deviceLabel: input.deviceLabel, tokenHash: input.digest }),
    listByWorkspace: (workspaceId) => repository.listByWorkspace(workspaceId),
    revoke: (workspaceId, credentialId) => repository.revoke(workspaceId, credentialId),
    rotate: (workspaceId, credentialId, input) =>
      repository.rotate(workspaceId, credentialId, { deviceLabel: input.deviceLabel, tokenHash: input.digest })
  };
}

function templates(repository: BankSmsTemplateRepository): AdminTemplateStore {
  return { assign: (input) => repository.assign(input) };
}

const args = process.argv.slice(2);
const output = {
  write: (line: string) => process.stdout.write(`${line}\n`),
  error: (line: string) => process.stderr.write(`${line}\n`)
};

if (args[0] === "--help") {
  process.exitCode = await runBankSmsAdmin(args, {
    credentials: {} as AdminCredentialStore,
    templates: {} as AdminTemplateStore,
    ...output
  });
} else {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    process.stderr.write("DATABASE_URL is required\n");
    process.exitCode = 1;
  } else {
  const { db, pool } = createPostgresDatabase(connectionString);
  try {
      process.exitCode = await runBankSmsAdmin(args, {
        credentials: credentials(new DrizzleBankSmsCredentialRepository(db)),
        templates: templates(new DrizzleBankSmsTemplateRepository(db)),
        ...output
      });
  } catch {
    process.stderr.write("bank SMS administration failed\n");
    process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
