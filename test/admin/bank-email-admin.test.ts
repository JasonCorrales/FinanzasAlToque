import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  BAC_EMAIL_ADAPTER,
  BAC_PURCHASE_SOURCE,
  BAC_PURCHASE_VERSION,
  runBankEmailAdmin,
  type AdminCredential,
  type AdminCredentialStore,
  type AdminTemplateStore
} from "../../src/admin/bank-email-admin.js";

const workspace = "10000000-0000-4000-8000-000000000001";
const otherWorkspace = "20000000-0000-4000-8000-000000000002";
const credential = "30000000-0000-4000-8000-000000000003";

interface State {
  credentials: AdminCredential[];
  digests: string[];
  templates: Array<{ workspaceId: string; source: string; version: string; paymentMethod: string }>;
  enabledPaymentMethods: Array<{ workspaceId: string; code: string }>;
}

function fixture() {
  const state: State = {
    credentials: [],
    digests: [],
    templates: [],
    enabledPaymentMethods: [{ workspaceId: workspace, code: "card" }]
  };
  let id = 0;
  const credentials: AdminCredentialStore = {
    async create(input) {
      state.digests.push(input.digest);
      const record: AdminCredential = {
        id: `30000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
        workspaceId: input.workspaceId,
        adapter: input.adapter,
        active: true,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null
      };
      state.credentials.push(record);
      return record;
    },
    async listByWorkspace(workspaceId) {
      return state.credentials.filter((record) => record.workspaceId === workspaceId);
    },
    async revoke(workspaceId, credentialId) {
      const record = state.credentials.find((item) => item.workspaceId === workspaceId && item.id === credentialId && item.active);
      if (!record) return null;
      record.active = false;
      record.revokedAt = new Date("2026-03-01T01:00:00.000Z");
      return record;
    },
    async rotate(workspaceId, credentialId, input) {
      const record = state.credentials.find((item) => item.workspaceId === workspaceId && item.id === credentialId && item.active);
      if (!record) return null;
      record.active = false;
      record.revokedAt = new Date("2026-03-01T01:00:00.000Z");
      return this.create({ workspaceId, adapter: input.adapter, digest: input.digest });
    }
  };
  const templates: AdminTemplateStore = {
    async assign(input) {
      if (!state.enabledPaymentMethods.some((method) => method.workspaceId === input.workspaceId && method.code === input.paymentMethod)) {
        throw new Error("bank email template payment method is unavailable");
      }
      state.templates.push(input);
      return input;
    }
  };
  return { state, credentials, templates };
}

async function run(args: string[], setup = fixture(), token = "a".repeat(43)) {
  const output: string[] = [];
  const errors: string[] = [];
  const result = await runBankEmailAdmin(args, {
    credentials: setup.credentials,
    templates: setup.templates,
    write: (line) => output.push(line),
    error: (line) => errors.push(line),
    generateToken: () => token
  });
  return { ...setup, result, stdout: output.join("\n"), stderr: errors.join("\n") };
}

describe("bank email administrative CLI", () => {
  it("creates a BAC adapter credential, persists only its SHA-256 digest, and discloses the token once", async () => {
    const actual = await run(["create-adapter", "--workspace", workspace]);

    expect(actual.result).toBe(0);
    expect(actual.stdout).toBe(`created BAC email adapter 30000000-0000-4000-8000-000000000001 for ${workspace}\ntoken: ${"a".repeat(43)}`);
    expect(actual.stderr).toBe("");
    expect(actual.state.credentials[0]?.adapter).toBe(BAC_EMAIL_ADAPTER);
    expect(actual.state.digests).toEqual([createHash("sha256").update("a".repeat(43)).digest("hex")]);
    expect(JSON.stringify(actual.state)).not.toContain("a".repeat(43));
  });

  it("lists only safe credential fields for the requested workspace without a token hash", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: workspace, adapter: BAC_EMAIL_ADAPTER, active: true, createdAt: new Date("2026-03-01T00:00:00.000Z"), updatedAt: new Date("2026-03-01T00:00:00.000Z"), lastUsedAt: null, revokedAt: null });
    setup.state.credentials.push({ id: "40000000-0000-4000-8000-000000000004", workspaceId: otherWorkspace, adapter: "Other", active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const actual = await run(["list-adapters", "--workspace", workspace], setup);

    expect(actual.result).toBe(0);
    expect(actual.stdout).toBe(JSON.stringify([{ id: credential, adapter: BAC_EMAIL_ADAPTER, active: true, createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", lastUsedAt: null, revokedAt: null }]));
    expect(actual.stdout).not.toContain("hash");
    expect(actual.stderr).toBe("");
  });

  it("revokes and rotates only active credentials in their workspace", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: workspace, adapter: BAC_EMAIL_ADAPTER, active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const revoked = await run(["revoke-adapter", "--workspace", workspace, "--credential", credential], setup);
    const repeated = await run(["revoke-adapter", "--workspace", workspace, "--credential", credential], setup);
    setup.state.credentials[0]!.active = true;
    const rotated = await run(["rotate-adapter", "--workspace", workspace, "--credential", credential], setup, "b".repeat(43));

    expect(revoked).toMatchObject({ result: 0, stdout: `revoked BAC email adapter ${credential}`, stderr: "" });
    expect(repeated).toMatchObject({ result: 1, stdout: "", stderr: "credential not found or already inactive" });
    expect(rotated).toMatchObject({ result: 0, stdout: `rotated BAC email adapter ${credential}\ntoken: ${"b".repeat(43)}`, stderr: "" });
    expect(setup.state.digests).toEqual([createHash("sha256").update("b".repeat(43)).digest("hex")]);
  });

  it("does not mutate a credential from another workspace", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: otherWorkspace, adapter: BAC_EMAIL_ADAPTER, active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const before = JSON.stringify(setup.state);
    const actual = await run(["revoke-adapter", "--workspace", workspace, "--credential", credential], setup);

    expect(actual).toMatchObject({ result: 1, stdout: "", stderr: "credential not found or already inactive" });
    expect(JSON.stringify(actual.state)).toBe(before);
  });

  it("assigns the committed BAC purchase source and version only to an enabled workspace payment method", async () => {
    const setup = fixture();
    const assigned = await run(["assign-bac-purchase", "--workspace", workspace, "--payment-method", "card"], setup);

    expect(assigned).toMatchObject({ result: 0, stdout: `assigned BAC purchase template ${BAC_PURCHASE_VERSION} to ${workspace}`, stderr: "" });
    expect(assigned.state.templates).toEqual([{ workspaceId: workspace, source: BAC_PURCHASE_SOURCE, version: BAC_PURCHASE_VERSION, paymentMethod: "card" }]);
    await expect(run(["assign-bac-purchase", "--workspace", workspace, "--payment-method", "disabled"], setup)).rejects.toThrow("payment method is unavailable");
    await expect(run(["assign-bac-purchase", "--workspace", otherWorkspace, "--payment-method", "card"], setup)).rejects.toThrow("payment method is unavailable");
  });

  it("prints complete help and deterministically rejects invalid CLI input without mutations", async () => {
    const setup = fixture();
    const help = await run(["--help"], setup);
    const unknown = await run(["destroy", "--workspace", workspace], setup);
    const invalid = await run(["create-adapter", "--workspace", "nope"], setup);
    const missing = await run(["assign-bac-purchase", "--workspace", workspace], setup);
    const unknownOption = await run(["list-adapters", "--workspace", workspace, "--token", "secret"], setup);

    expect(help.result).toBe(0);
    expect(help.stdout).toContain("create-adapter --workspace <uuid>");
    expect(help.stdout).toContain("assign-bac-purchase --workspace <uuid> --payment-method <code>");
    expect(unknown).toMatchObject({ result: 1, stdout: "", stderr: "unknown command" });
    expect(invalid).toMatchObject({ result: 1, stdout: "", stderr: "invalid workspace UUID" });
    expect(missing).toMatchObject({ result: 1, stdout: "", stderr: "missing required option" });
    expect(unknownOption).toMatchObject({ result: 1, stdout: "", stderr: "unknown option" });
    expect(setup.state).toEqual({ credentials: [], digests: [], templates: [], enabledPaymentMethods: [{ workspaceId: workspace, code: "card" }] });
  });
});
