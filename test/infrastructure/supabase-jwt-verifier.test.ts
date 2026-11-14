import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SupabaseJwtVerificationError,
  SupabaseJwtVerifier
} from "../../src/infrastructure/auth/supabase-jwt-verifier.js";

const supabaseUrl = "https://example.supabase.co";
const issuer = `${supabaseUrl}/auth/v1`;
afterEach(() => {
  vi.unstubAllGlobals();
});

async function createToken(
  claims: Record<string, unknown> = {},
  overrides: { issuer?: string; audience?: string; expiresAt?: string | false } = {}
) {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  const tokenBuilder = new SignJWT({ sub: "supabase-user-id", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? "authenticated");
  if (overrides.expiresAt !== false) tokenBuilder.setExpirationTime(overrides.expiresAt ?? "2h");
  const token = await tokenBuilder.sign(privateKey);
  return { jwk, token };
}

function mockJwks(jwk: JWK) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("SupabaseJwtVerifier", () => {
  it("verifies a signed Supabase access token against the project JWKS and returns its non-empty subject", async () => {
    const { jwk, token } = await createToken();
    const fetch = mockJwks(jwk);
    const verifier = new SupabaseJwtVerifier({ supabaseUrl });

    await expect(verifier.verify(token)).resolves.toEqual({ id: "supabase-user-id" });
    expect(fetch).toHaveBeenCalledWith(
      `${issuer}/.well-known/jwks.json`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it.each([
    ["an invalid signature", async () => {
      const trusted = await createToken();
      const untrusted = await createToken();
      mockJwks(trusted.jwk);
      return untrusted.token;
    }],
    ["a wrong issuer", async () => {
      const signed = await createToken({}, { issuer: "https://attacker.example/auth/v1" });
      mockJwks(signed.jwk);
      return signed.token;
    }],
    ["a wrong audience", async () => {
      const signed = await createToken({}, { audience: "anon" });
      mockJwks(signed.jwk);
      return signed.token;
    }],
    ["an expired token", async () => {
      const signed = await createToken({}, { expiresAt: "-1h" });
      mockJwks(signed.jwk);
      return signed.token;
    }],
    ["a token without an expiration", async () => {
      const signed = await createToken({}, { expiresAt: false });
      mockJwks(signed.jwk);
      return signed.token;
    }],
    ["an empty subject", async () => {
      const signed = await createToken({ sub: "" });
      mockJwks(signed.jwk);
      return signed.token;
    }]
  ])("rejects %s", async (_caseName, createInvalidToken) => {
    const verifier = new SupabaseJwtVerifier({ supabaseUrl });
    await expect(verifier.verify(await createInvalidToken())).rejects.toBeInstanceOf(
      SupabaseJwtVerificationError
    );
  });
});
