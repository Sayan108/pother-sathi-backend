import { OAuth2Client } from "google-auth-library";
import { env } from "../config/environment";
import { verifyToken, VerifiedIdentity } from "./google-auth.service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function buildGoogleOAuthUrl(state: string): string {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured properly");
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForGoogleIdentity(
  code: string,
): Promise<VerifiedIdentity> {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    throw new Error("Google OAuth is not configured properly");
  }

  const client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );

  const tokenResponse = await client.getToken(code);
  const idToken = tokenResponse.tokens.id_token;
  if (!idToken) {
    throw new Error("Failed to obtain Google ID token");
  }

  return verifyToken("google", idToken);
}
