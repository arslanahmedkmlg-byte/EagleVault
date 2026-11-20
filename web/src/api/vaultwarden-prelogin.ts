/**
 * Bitwarden-compatible KDF discovery.
 *
 * The returned KDF parameters must be validated before deriving a master key.
 * The normalized account email is the legacy Bitwarden password-KDF salt;
 * the server response's salt field is null for existing accounts.
 */
export type VaultKdf =
  | { type: "pbkdf2-sha256"; iterations: number }
  | { type: "argon2id"; iterations: number; memory: number; parallelism: number };

export interface PreloginResult {
  emailSalt: string;
  kdf: VaultKdf;
}

interface PreloginWireResponse {
  kdf?: number;
  kdfIterations?: number;
  kdfMemory?: number | null;
  kdfParallelism?: number | null;
  kdfSettings?: {
    kdfType?: number;
    iterations?: number;
    memory?: number | null;
    parallelism?: number | null;
  };
  salt?: string | null;
}

export async function fetchVaultwardenPrelogin(
  serverUrl: string,
  email: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<PreloginResult> {
  const base = new URL(serverUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new Error("Vaultwarden server URL must use HTTPS.");
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("A valid account email is required.");
  }

  const response = await fetchImpl(new URL("/api/accounts/prelogin", base), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: normalizedEmail }),
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error("Vaultwarden pre-login failed with HTTP " + response.status);
  }

  const data = (await response.json()) as PreloginWireResponse;
  return parsePreloginKdf(data, normalizedEmail);
}

export function parsePreloginKdf(data: PreloginWireResponse, normalizedEmail: string): PreloginResult {
  const settings = data.kdfSettings;
  const type = settings?.kdfType ?? data.kdf;
  const iterations = settings?.iterations ?? data.kdfIterations;
  if (!Number.isInteger(iterations)) {
    throw new Error("Server returned invalid KDF iteration settings.");
  }

  if (type === 0) {
    if (iterations! < 5000 || iterations! > 2_000_000) {
      throw new Error("PBKDF2 settings are outside the accepted pre-login range.");
    }
    return { emailSalt: normalizedEmail, kdf: { type: "pbkdf2-sha256", iterations: iterations! } };
  }

  if (type === 1) {
    const memory = settings?.memory ?? data.kdfMemory;
    const parallelism = settings?.parallelism ?? data.kdfParallelism;
    if (!Number.isInteger(memory) || !Number.isInteger(parallelism) ||
        iterations! < 2 || iterations! > 10 || memory! < 16 || memory! > 1024 ||
        parallelism! < 1 || parallelism! > 16) {
      throw new Error("Argon2id settings are outside the accepted pre-login range.");
    }
    return {
      emailSalt: normalizedEmail,
      kdf: { type: "argon2id", iterations: iterations!, memory: memory!, parallelism: parallelism! },
    };
  }

  throw new Error("Server returned an unsupported KDF type.");
}
