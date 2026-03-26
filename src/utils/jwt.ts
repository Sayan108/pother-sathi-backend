import jwt from "jsonwebtoken";
import { env } from "../config/environment";

export type TokenPayload = {
  id: string;
  phone: string;
  role: "rider" | "driver";
};

export type RefreshTokenPayload = TokenPayload & { tokenVersion?: number };

function requireSecret(secret: string | undefined, name: string): string {
  if (!secret) throw new Error(`${name} must be set in environment variables`);
  return secret;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, requireSecret(env.JWT_SECRET, "JWT_SECRET"), {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: "pothersathi",
    audience: "pothersathi-client",
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(
    payload,
    requireSecret(env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET"),
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      issuer: "pothersathi",
      audience: "pothersathi-client",
    },
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(
    token,
    requireSecret(env.JWT_SECRET, "JWT_SECRET"),
    {
      issuer: "pothersathi",
      audience: "pothersathi-client",
    },
  ) as unknown;
  return decoded as TokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(
    token,
    requireSecret(env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET"),
    {
      issuer: "pothersathi",
      audience: "pothersathi-client",
    },
  ) as unknown;
  return decoded as RefreshTokenPayload;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
