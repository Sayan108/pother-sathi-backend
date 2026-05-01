/**
 * Google Identity Verification Service
 *
 * Verifies Google ID tokens issued by the mobile clients (Firebase / Google
 * Sign-In SDK).  The service is deliberately thin so that a future
 * government-gateway integration (e.g. DigiLocker OAuth, Aadhaar eKYC) can be
 * slotted in by adding a new provider class and registering it here — the
 * callers never need to change.
 *
 * Current providers
 * ─────────────────
 *  • Google OAuth2 — used for Rider and Driver Social Sign-In.
 *
 * Planned providers (future releases)
 * ────────────────────────────────────
 *  • AadhaarKYCProvider  — UIDAI / DigiLocker eKYC gateway
 *  • DigiLockerProvider  — document fetch via DigiLocker OAuth
 */

import { OAuth2Client, TokenPayload } from "google-auth-library";
import { env } from "../config/environment";
import { logger } from "../utils/logger";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Normalised identity payload returned by every provider. */
export interface VerifiedIdentity {
  /** Stable unique identifier for this provider account (e.g. Google sub). */
  providerId: string;
  /** Primary email address. */
  email?: string;
  /** Display name. */
  name?: string;
  /** Avatar URL. */
  picture?: string;
  /** Whether the email has been verified by the provider. */
  emailVerified: boolean;
}

// ─── Provider interface (extension point) ────────────────────────────────────

/**
 * Every identity provider must implement this interface.
 * When a government gateway is added, create a new class that satisfies this
 * contract and register it via `identityProviderRegistry`.
 */
export interface IdentityProvider {
  verify(token: string): Promise<VerifiedIdentity>;
}

// ─── Google OAuth2 provider ───────────────────────────────────────────────────

class GoogleIdentityProvider implements IdentityProvider {
  private client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(env.GOOGLE_CLIENT_ID || undefined);
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        // audience validation — skipped when GOOGLE_CLIENT_ID is not set (dev)
        ...(env.GOOGLE_CLIENT_ID ? { audience: env.GOOGLE_CLIENT_ID } : {}),
      });

      const payload = ticket.getPayload() as TokenPayload;
      if (!payload?.sub) {
        throw new Error("Invalid Google token: missing subject claim");
      }

      return {
        providerId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        emailVerified: payload.email_verified ?? false,
      };
    } catch (error) {
      logger.warn("Google token verification failed:", (error as Error).message);
      throw new Error("Invalid or expired Google token");
    }
  }
}

// ─── Provider registry (future: add government gateway here) ─────────────────

/**
 * Registry of available identity providers.
 * To add a new provider (e.g. DigiLocker):
 *   1. Create `DigiLockerIdentityProvider implements IdentityProvider`
 *   2. Add an entry:  identityProviderRegistry.set("digilocker", new DigiLockerIdentityProvider())
 *   3. Call `verifyToken("digilocker", token)` from the corresponding controller.
 */
export const identityProviderRegistry = new Map<string, IdentityProvider>([
  ["google", new GoogleIdentityProvider()],
]);

// ─── Public helper ────────────────────────────────────────────────────────────

/**
 * Verifies a token using the specified identity provider.
 *
 * @param provider  Key in `identityProviderRegistry` (e.g. "google")
 * @param token     Raw ID token from the client application
 * @returns         Normalised `VerifiedIdentity`
 * @throws          Error if the token is invalid or the provider is not found
 */
export async function verifyToken(
  provider: string,
  token: string,
): Promise<VerifiedIdentity> {
  const identityProvider = identityProviderRegistry.get(provider);
  if (!identityProvider) {
    throw new Error(`Identity provider "${provider}" is not registered`);
  }
  return identityProvider.verify(token);
}
