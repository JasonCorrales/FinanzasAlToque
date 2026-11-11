import { createHash, randomBytes } from "node:crypto";

export const COOPE_ANDE_SENDER = "+50662229581";
export const COOPE_ANDE_BODY =
  "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones";
const DEFAULT_VERSION = "coope-ande-v1";

export interface AdminCredential {
  id: string;
  workspaceId: string;
  deviceLabel: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface AdminCredentialStore {
  create(input: { workspaceId: string; deviceLabel: string; digest: string }): Promise<AdminCredential>;
  listByWorkspace(workspaceId: string): Promise<AdminCredential[]>;
  revoke(workspaceId: string, credentialId: string): Promise<AdminCredential | null>;
  rotate(
    workspaceId: string,
    credentialId: string,
    input: { deviceLabel: string; digest: string }
  ): Promise<AdminCredential | null>;
}

export interface AdminTemplateStore {
  assign(input: {
    workspaceId: string;
    sender: string;
    body: string;
    version: string;
    paymentMethod: string;
  }): Promise<unknown>;
}

export interface BankSmsAdminDependencies {
  credentials: AdminCredentialStore;
  templates: AdminTemplateStore;
  write: (line: string) => void;
  error: (line: string) => void;
  generateToken?: () => string;
}

const help = `Usage: bank-sms:admin <command> [options]

Commands:
  create-device --workspace <uuid> --label <text>
  list-devices --workspace <uuid>
  revoke-device --workspace <uuid> --credential <uuid>
  rotate-device --workspace <uuid> --credential <uuid> --label <text>
  assign-coope-ande --workspace <uuid> --payment-method <code> [--version <text>]

Options:
  --workspace <uuid>       Workspace identifier
  --credential <uuid>      Device credential identifier
  --label <text>           Device label
  --payment-method <code>  Payment method code
  --version <text>         Template version (default: ${DEFAULT_VERSION})
  --help                   Show this help`;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOptions(args: string[]): Record<string, string> | string {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith("--") || !value || value.startsWith("--") || option in options) {
      return "invalid options";
    }
    options[option] = value;
  }
  return options;
}

function requireOptions(
  options: Record<string, string>,
  required: string[],
  allowed: string[]
): string | null {
  if (Object.keys(options).some((option) => !allowed.includes(option))) return "unknown option";
  if (required.some((option) => !options[option])) return "missing required option";
  if (!uuid.test(options["--workspace"] ?? "")) return "invalid workspace UUID";
  if (options["--credential"] && !uuid.test(options["--credential"])) return "invalid credential UUID";
  if (["--label", "--payment-method", "--version"].some((option) => options[option]?.trim() === "")) {
    return "invalid option value";
  }
  return null;
}

function generatedToken(): string {
  return randomBytes(32).toString("base64url");
}

function digest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeCredential(record: AdminCredential) {
  return {
    id: record.id,
    deviceLabel: record.deviceLabel,
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null
  };
}

export async function runBankSmsAdmin(args: string[], dependencies: BankSmsAdminDependencies): Promise<number> {
  if (args.length === 0 || args[0] === "--help") {
    dependencies.write(help);
    return 0;
  }
  const [command, ...rawOptions] = args;
  if (!command || !["create-device", "list-devices", "revoke-device", "rotate-device", "assign-coope-ande"].includes(command)) {
    dependencies.error("unknown command");
    return 1;
  }
  const parsed = parseOptions(rawOptions);
  if (typeof parsed === "string") {
    dependencies.error(parsed);
    return 1;
  }
  const contracts: Record<string, { required: string[]; allowed: string[] }> = {
    "create-device": { required: ["--workspace", "--label"], allowed: ["--workspace", "--label"] },
    "list-devices": { required: ["--workspace"], allowed: ["--workspace"] },
    "revoke-device": { required: ["--workspace", "--credential"], allowed: ["--workspace", "--credential"] },
    "rotate-device": { required: ["--workspace", "--credential", "--label"], allowed: ["--workspace", "--credential", "--label"] },
    "assign-coope-ande": { required: ["--workspace", "--payment-method"], allowed: ["--workspace", "--payment-method", "--version"] }
  };
  const contract = contracts[command];
  if (!contract) {
    dependencies.error("unknown command");
    return 1;
  }
  const violation = requireOptions(parsed, contract.required, contract.allowed);
  if (violation) {
    dependencies.error(violation);
    return 1;
  }
  const workspaceId = parsed["--workspace"]!;

  if (command === "list-devices") {
    dependencies.write(JSON.stringify((await dependencies.credentials.listByWorkspace(workspaceId)).map(safeCredential)));
    return 0;
  }
  if (command === "assign-coope-ande") {
    const version = parsed["--version"] ?? DEFAULT_VERSION;
    await dependencies.templates.assign({ workspaceId, sender: COOPE_ANDE_SENDER, body: COOPE_ANDE_BODY, version, paymentMethod: parsed["--payment-method"]! });
    dependencies.write(`assigned Coope Ande template ${version} to ${workspaceId}`);
    return 0;
  }
  if (command === "revoke-device") {
    const revoked = await dependencies.credentials.revoke(workspaceId, parsed["--credential"]!);
    if (!revoked) {
      dependencies.error("credential not found or already inactive");
      return 1;
    }
    dependencies.write(`revoked device ${revoked.id}`);
    return 0;
  }

  const token = (dependencies.generateToken ?? generatedToken)();
  const input = { deviceLabel: parsed["--label"]!, digest: digest(token) };
  if (command === "create-device") {
    const created = await dependencies.credentials.create({ workspaceId, ...input });
    dependencies.write(`created device ${created.id} for ${workspaceId}\ntoken: ${token}`);
    return 0;
  }
  const rotated = await dependencies.credentials.rotate(workspaceId, parsed["--credential"]!, input);
  if (!rotated) {
    dependencies.error("credential not found or already inactive");
    return 1;
  }
  dependencies.write(`rotated device ${parsed["--credential"]!}\ntoken: ${token}`);
  return 0;
}
