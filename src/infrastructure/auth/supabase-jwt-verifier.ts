import { createRemoteJWKSet, jwtVerify } from "jose";

import type { AuthenticatedUser, AuthenticatedUserVerifier } from "../../application/ports.js";

export class SupabaseJwtVerificationError extends Error {
  constructor() {
    super("Supabase access token is invalid");
    this.name = "SupabaseJwtVerificationError";
  }
}

interface SupabaseJwtVerifierOptions {
  supabaseUrl: string;
}

export class SupabaseJwtVerifier implements AuthenticatedUserVerifier {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor({ supabaseUrl }: SupabaseJwtVerifierOptions) {
    this.issuer = supabaseIssuer(supabaseUrl);
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verify(accessToken: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        issuer: this.issuer,
        audience: "authenticated"
      });
      if (typeof payload.exp !== "number" || typeof payload.sub !== "string" || !payload.sub.trim()) {
        throw new SupabaseJwtVerificationError();
      }
      return { id: payload.sub };
    } catch {
      throw new SupabaseJwtVerificationError();
    }
  }
}

function supabaseIssuer(supabaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL must be an absolute URL");
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SUPABASE_URL must be an HTTPS project URL without a path, query, or fragment");
  }
  return `${url.origin}/auth/v1`;
}
