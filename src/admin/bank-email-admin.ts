import { createHash, randomBytes } from "node:crypto";

export const BAC_EMAIL_ADAPTER = "BAC email adapter";
export const BAC_PURCHASE_SOURCE = "bac_purchase";
export const BAC_PURCHASE_VERSION = "bac-email-v1";

export interface AdminCredential {
  id: string;
  workspaceId: string;
  adapter: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface AdminCredentialStore {
  create(input: { workspaceId: string; adapter: string; digest: string }): Promise<AdminCredential>;
  listByWorkspace(workspaceId: string): Promise<AdminCredential[]>;
  revoke(workspaceId: string, credentialId: string): Promise<AdminCredential | null>;
  rotate(
    workspaceId: string,
    credentialId: string,
    input: { adapter: string; digest: string }
  ): Promise<AdminCredential | null>;
}

export interface AdminTemplateStore {
  assign(input: {
    workspaceId: string;
    source: string;
    version: string;
    paymentMethod: string;
    institution: string;
    cardBrand: string;
    cardLastFour: string;
  }): Promise<unknown>;
}

export interface BankEmailAdminDependencies {
  credentials: AdminCredentialStore;
  templates: AdminTemplateStore;
  write: (line: string) => void;
  error: (line: string) => void;
  generateToken?: () => string;
}

const help = `Usage: bank-email:admin <command> [options]

Commands:
  create-adapter --workspace <uuid>
  list-adapters --workspace <uuid>
  revoke-adapter --workspace <uuid> --credential <uuid>
  rotate-adapter --workspace <uuid> --credential <uuid>
  assign-bac-purchase --workspace <uuid> --payment-method <code> --card-last-four <4 digits>

Options:
  --workspace <uuid>       Workspace identifier
  --credential <uuid>      Adapter credential identifier
  --payment-method <code>  Enabled payment method code
  --card-last-four <digits> Masked card last four digits
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

function requireOptions(options: Record<string, string>, required: string[], allowed: string[]): string | null {
  if (Object.keys(options).some((option) => !allowed.includes(option))) return "unknown option";
  if (required.some((option) => !options[option])) return "missing required option";
  if (!uuid.test(options["--workspace"] ?? "")) return "invalid workspace UUID";
  if (options["--credential"] && !uuid.test(options["--credential"])) return "invalid credential UUID";
  if (options["--payment-method"]?.trim() === "") return "invalid option value";
  if (options["--card-last-four"] && !/^\d{4}$/.test(options["--card-last-four"])) return "invalid card last four";
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
    adapter: record.adapter,
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null
  };
}

export async function runBankEmailAdmin(args: string[], dependencies: BankEmailAdminDependencies): Promise<number> {
  if (args.length === 0 || args[0] === "--help") {
    dependencies.write(help);
    return 0;
  }
  const [command, ...rawOptions] = args;
  if (!command || !["create-adapter", "list-adapters", "revoke-adapter", "rotate-adapter", "assign-bac-purchase"].includes(command)) {
    dependencies.error("unknown command");
    return 1;
  }
  const parsed = parseOptions(rawOptions);
  if (typeof parsed === "string") {
    dependencies.error(parsed);
    return 1;
  }
  const contracts: Record<string, { required: string[]; allowed: string[] }> = {
    "create-adapter": { required: ["--workspace"], allowed: ["--workspace"] },
    "list-adapters": { required: ["--workspace"], allowed: ["--workspace"] },
    "revoke-adapter": { required: ["--workspace", "--credential"], allowed: ["--workspace", "--credential"] },
    "rotate-adapter": { required: ["--workspace", "--credential"], allowed: ["--workspace", "--credential"] },
    "assign-bac-purchase": {
      required: ["--workspace", "--payment-method", "--card-last-four"],
      allowed: ["--workspace", "--payment-method", "--card-last-four"]
    }
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

  if (command === "list-adapters") {
    dependencies.write(JSON.stringify((await dependencies.credentials.listByWorkspace(workspaceId)).map(safeCredential)));
    return 0;
  }
  if (command === "assign-bac-purchase") {
    await dependencies.templates.assign({
      workspaceId,
      source: BAC_PURCHASE_SOURCE,
      version: BAC_PURCHASE_VERSION,
      paymentMethod: parsed["--payment-method"]!,
      institution: "BAC",
      cardBrand: "VISA",
      cardLastFour: parsed["--card-last-four"]!
    });
    dependencies.write(`assigned BAC purchase template ${BAC_PURCHASE_VERSION} to ${workspaceId}`);
    return 0;
  }
  if (command === "revoke-adapter") {
    const revoked = await dependencies.credentials.revoke(workspaceId, parsed["--credential"]!);
    if (!revoked) {
      dependencies.error("credential not found or already inactive");
      return 1;
    }
    dependencies.write(`revoked BAC email adapter ${revoked.id}`);
    return 0;
  }

  if (command === "create-adapter") {
    const token = (dependencies.generateToken ?? generatedToken)();
    const created = await dependencies.credentials.create({ workspaceId, adapter: BAC_EMAIL_ADAPTER, digest: digest(token) });
    dependencies.write(`created BAC email adapter ${created.id} for ${workspaceId}\ntoken: ${token}`);
    return 0;
  }
  const token = (dependencies.generateToken ?? generatedToken)();
  const rotated = await dependencies.credentials.rotate(workspaceId, parsed["--credential"]!, { adapter: BAC_EMAIL_ADAPTER, digest: digest(token) });
  if (!rotated) {
    dependencies.error("credential not found or already inactive");
    return 1;
  }
  dependencies.write(`rotated BAC email adapter ${parsed["--credential"]!}\ntoken: ${token}`);
  return 0;
}
