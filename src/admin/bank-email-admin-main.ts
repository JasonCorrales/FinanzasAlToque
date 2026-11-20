import type { BankEmailCredentialRepository, BankEmailTemplateRepository } from "../application/ports.js";
import { createPostgresDatabase } from "../infrastructure/database/node-postgres.js";
import { DrizzleBankEmailCredentialRepository } from "../infrastructure/repositories/drizzle-bank-email-credential-repository.js";
import { DrizzleBankEmailTemplateRepository } from "../infrastructure/repositories/drizzle-bank-email-template-repository.js";
import { runBankEmailAdmin, type AdminCredentialStore, type AdminTemplateStore } from "./bank-email-admin.js";

function credentials(repository: BankEmailCredentialRepository): AdminCredentialStore {
  return {
    create: (input) => repository.create({ workspaceId: input.workspaceId, adapter: input.adapter, tokenHash: input.digest }),
    listByWorkspace: (workspaceId) => repository.listByWorkspace(workspaceId),
    revoke: (workspaceId, credentialId) => repository.revoke(workspaceId, credentialId),
    rotate: (workspaceId, credentialId, input) =>
      repository.rotate(workspaceId, credentialId, { adapter: input.adapter, tokenHash: input.digest })
  };
}

function templates(repository: BankEmailTemplateRepository): AdminTemplateStore {
  return { assign: (input) => repository.assign(input) };
}

const args = process.argv.slice(2);
const output = {
  write: (line: string) => process.stdout.write(`${line}\n`),
  error: (line: string) => process.stderr.write(`${line}\n`)
};

if (args[0] === "--help") {
  process.exitCode = await runBankEmailAdmin(args, {
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
      process.exitCode = await runBankEmailAdmin(args, {
        credentials: credentials(new DrizzleBankEmailCredentialRepository(db)),
        templates: templates(new DrizzleBankEmailTemplateRepository(db)),
        ...output
      });
    } catch {
      process.stderr.write("bank email administration failed\n");
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
