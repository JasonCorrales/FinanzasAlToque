import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  COOPE_ANDE_BODY,
  COOPE_ANDE_SENDER,
  runBankSmsAdmin,
  type AdminCredential,
  type AdminCredentialStore,
  type AdminTemplateStore
} from "../../src/admin/bank-sms-admin.js";

const workspace = "10000000-0000-4000-8000-000000000001";
const otherWorkspace = "20000000-0000-4000-8000-000000000002";
const credential = "30000000-0000-4000-8000-000000000003";

interface State {
  credentials: AdminCredential[];
  digests: string[];
  templates: Array<{ workspaceId: string; sender: string; body: string; version: string; paymentMethod: string }>;
}

function fixture() {
  const state: State = { credentials: [], digests: [], templates: [] };
  let id = 0;
  const credentials: AdminCredentialStore = {
    async create(input) {
      state.digests.push(input.digest);
      const record: AdminCredential = {
        id: `30000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
        workspaceId: input.workspaceId,
        deviceLabel: input.deviceLabel,
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
      return this.create({ workspaceId, deviceLabel: input.deviceLabel, digest: input.digest });
    }
  };
  const templates: AdminTemplateStore = {
    async assign(input) {
      state.templates.push(input);
      return input;
    }
  };
  return { state, credentials, templates };
}

async function run(args: string[], setup = fixture(), token = "a".repeat(43)) {
  const output: string[] = [];
  const errors: string[] = [];
  const result = await runBankSmsAdmin(args, {
    credentials: setup.credentials,
    templates: setup.templates,
    write: (line) => output.push(line),
    error: (line) => errors.push(line),
    generateToken: () => token
  });
  return { ...setup, result, stdout: output.join("\n"), stderr: errors.join("\n") };
}

describe("bank SMS administrative CLI", () => {
  it("creates a credential, persists only its SHA-256 digest, and prints the token once", async () => {
    const actual = await run(["create-device", "--workspace", workspace, "--label", "iPhone"]);

    expect(actual.result).toBe(0);
    expect(actual.stdout).toBe(`created device 30000000-0000-4000-8000-000000000001 for ${workspace}\ntoken: ${"a".repeat(43)}`);
    expect(actual.stderr).toBe("");
    expect(actual.state.digests).toEqual([createHash("sha256").update("a".repeat(43)).digest("hex")]);
    expect(JSON.stringify(actual.state)).not.toContain("a".repeat(43));
  });

  it("lists only safe credential fields for the requested workspace", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: workspace, deviceLabel: "iPhone", active: true, createdAt: new Date("2026-03-01T00:00:00.000Z"), updatedAt: new Date("2026-03-01T00:00:00.000Z"), lastUsedAt: null, revokedAt: null });
    setup.state.credentials.push({ id: "40000000-0000-4000-8000-000000000004", workspaceId: otherWorkspace, deviceLabel: "Other", active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const actual = await run(["list-devices", "--workspace", workspace], setup);

    expect(actual.result).toBe(0);
    expect(actual.stdout).toBe(JSON.stringify([{ id: credential, deviceLabel: "iPhone", active: true, createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", lastUsedAt: null, revokedAt: null }]));
    expect(actual.stderr).toBe("");
  });

  it("revokes only an active credential in its workspace and fails closed idempotently", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: workspace, deviceLabel: "iPhone", active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const revoked = await run(["revoke-device", "--workspace", workspace, "--credential", credential], setup);
    const repeated = await run(["revoke-device", "--workspace", workspace, "--credential", credential], setup);

    expect(revoked.result).toBe(0);
    expect(revoked.stdout).toBe(`revoked device ${credential}`);
    expect(revoked.stderr).toBe("");
    expect(repeated.result).toBe(1);
    expect(repeated.stdout).toBe("");
    expect(repeated.stderr).toBe("credential not found or already inactive");
  });

  it("does not mutate a credential from another workspace", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: otherWorkspace, deviceLabel: "Other", active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const before = JSON.stringify(setup.state);
    const actual = await run(["revoke-device", "--workspace", workspace, "--credential", credential], setup);

    expect(actual.result).toBe(1);
    expect(actual.stdout).toBe("");
    expect(actual.stderr).toBe("credential not found or already inactive");
    expect(JSON.stringify(actual.state)).toBe(before);
  });

  it("rotates an active credential, replacing it with a newly disclosed token", async () => {
    const setup = fixture();
    setup.state.credentials.push({ id: credential, workspaceId: workspace, deviceLabel: "Old", active: true, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null });
    const actual = await run(["rotate-device", "--workspace", workspace, "--credential", credential, "--label", "New"], setup, "b".repeat(43));

    expect(actual.result).toBe(0);
    expect(actual.stdout).toBe(`rotated device ${credential}\ntoken: ${"b".repeat(43)}`);
    expect(actual.stderr).toBe("");
    expect(actual.state.credentials[0]?.active).toBe(false);
    expect(actual.state.digests).toEqual([createHash("sha256").update("b".repeat(43)).digest("hex")]);
  });

  it("assigns the fixed Coope Ande template with an explicit or safe default version", async () => {
    const defaulted = await run(["assign-coope-ande", "--workspace", workspace, "--payment-method", "card"]);
    const explicit = await run(["assign-coope-ande", "--workspace", workspace, "--payment-method", "debit", "--version", "v2"]);

    expect(defaulted.result).toBe(0);
    expect(defaulted.stdout).toBe(`assigned Coope Ande template coope-ande-v1 to ${workspace}`);
    expect(defaulted.stderr).toBe("");
    expect(defaulted.state.templates).toEqual([{ workspaceId: workspace, sender: COOPE_ANDE_SENDER, body: COOPE_ANDE_BODY, version: "coope-ande-v1", paymentMethod: "card" }]);
    expect(explicit.state.templates[0]).toMatchObject({ version: "v2", paymentMethod: "debit" });
  });

  it("prints complete help and rejects unknown commands or invalid input without mutations", async () => {
    const setup = fixture();
    const help = await run(["--help"], setup);
    const unknown = await run(["destroy", "--workspace", workspace], setup);
    const invalid = await run(["create-device", "--workspace", "nope", "--label", "iPhone"], setup);
    const missing = await run(["assign-coope-ande", "--workspace", workspace], setup);
    const unknownOption = await run(["list-devices", "--workspace", workspace, "--token", "secret"], setup);

    expect(help.result).toBe(0);
    expect(help.stdout).toContain("create-device --workspace <uuid> --label <text>");
    expect(help.stdout).toContain("list-devices --workspace <uuid>");
    expect(help.stdout).toContain("revoke-device --workspace <uuid> --credential <uuid>");
    expect(help.stdout).toContain("rotate-device --workspace <uuid> --credential <uuid> --label <text>");
    expect(help.stdout).toContain("assign-coope-ande --workspace <uuid> --payment-method <code> [--version <text>]");
    expect(help.stderr).toBe("");
    expect(unknown).toMatchObject({ result: 1, stdout: "", stderr: "unknown command" });
    expect(invalid).toMatchObject({ result: 1, stdout: "", stderr: "invalid workspace UUID" });
    expect(missing).toMatchObject({ result: 1, stdout: "", stderr: "missing required option" });
    expect(unknownOption).toMatchObject({ result: 1, stdout: "", stderr: "unknown option" });
    expect(setup.state).toEqual({ credentials: [], digests: [], templates: [] });
  });
});
