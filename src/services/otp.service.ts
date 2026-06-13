import https from "https";
import crypto from "crypto";
import { OTP, OTPPurpose, OTPUserType } from "../models/OTP";
import { env } from "../config/environment";
import { logger } from "../utils/logger";

function isPlaceholderUrl(url: string): boolean {
  return /example|placeholder|localhost/i.test(url);
}

function buildMessageCentralHeaders(): Record<string, string> {
  const headerName = env.MESSAGE_CENTRAL_API_KEY_HEADER_NAME || "Authorization";
  const prefix = env.MESSAGE_CENTRAL_API_KEY_PREFIX || "Bearer ";
  return {
    "Content-Type": "application/json",
    [headerName]: `${prefix}${env.MESSAGE_CENTRAL_API_KEY}`,
  };
}

function isMessageCentralConfigured(): boolean {
  if (!env.MESSAGE_CENTRAL_API_URL || !env.MESSAGE_CENTRAL_API_KEY) {
    return false;
  }
  try {
    const parsed = new URL(env.MESSAGE_CENTRAL_API_URL);
    if (!parsed.protocol.startsWith("http")) return false;
    if (isPlaceholderUrl(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchVerifyNowAuthToken(): Promise<string> {
  if (!env.MESSAGE_CENTRAL_CUSTOMER_ID || !env.MESSAGE_CENTRAL_KEY) {
    throw new Error(
      "Message Central VerifyNow auth token cannot be fetched without MESSAGE_CENTRAL_CUSTOMER_ID and MESSAGE_CENTRAL_KEY",
    );
  }

  const query = new URLSearchParams({
    customerId: env.MESSAGE_CENTRAL_CUSTOMER_ID,
    key: env.MESSAGE_CENTRAL_KEY,
    scope: "NEW",
  });
  if (env.MESSAGE_CENTRAL_EMAIL) {
    query.set("email", env.MESSAGE_CENTRAL_EMAIL);
  }
  if (env.MESSAGE_CENTRAL_COUNTRY) {
    query.set("country", env.MESSAGE_CENTRAL_COUNTRY);
  }

  const tokenUrl = new URL(env.MESSAGE_CENTRAL_API_URL);
  tokenUrl.pathname = "/auth/v1/authentication/token";
  tokenUrl.search = query.toString();

  logger.debug("Message Central auth token request", {
    url: tokenUrl.toString(),
    customerId: env.MESSAGE_CENTRAL_CUSTOMER_ID,
    country: env.MESSAGE_CENTRAL_COUNTRY,
  });

  const responseData = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      tokenUrl,
      {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          logger.debug("Message Central auth token response", {
            statusCode: res.statusCode,
            body: data,
          });
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            const error = new Error(
              `VerifyNow token request failed: ${res.statusCode} ${data}`,
            );
            logger.error("Message Central auth token denied", {
              statusCode: res.statusCode,
              body: data,
            });
            reject(error);
          }
        });
      },
    );
    req.on("error", (error) => {
      logger.error("Message Central auth token request error", { error });
      reject(error);
    });
    req.end();
  });

  const json = JSON.parse(responseData) as any;
  const authToken =
    json.authToken ?? json.token ?? json.data?.authToken ?? json.data?.token;
  if (!authToken) {
    throw new Error(
      `Failed to obtain VerifyNow auth token; response was: ${responseData}`,
    );
  }
  return authToken;
}

async function getMessageCentralAuthHeaders(): Promise<Record<string, string>> {
  const usingTokenAuth = Boolean(
    env.MESSAGE_CENTRAL_CUSTOMER_ID && env.MESSAGE_CENTRAL_KEY,
  );

  if (usingTokenAuth) {
    logger.info("Message Central auth mode: token auth");
    try {
      const authToken = await fetchVerifyNowAuthToken();
      return { authToken };
    } catch (error) {
      logger.warn(
        "Message Central token auth failed; falling back to API key auth",
        {
          error: error instanceof Error ? error.message : error,
        },
      );
      logger.info("Message Central auth mode: API key auth (fallback)");
      return buildMessageCentralHeaders();
    }
  }

  logger.info("Message Central auth mode: API key auth");
  return buildMessageCentralHeaders();
}

async function sendViaVerifyNow(
  to: string,
  countryCode: string,
): Promise<{ verificationId: string }> {
  const authHeaders = await getMessageCentralAuthHeaders();
  const safeCountryCode = countryCode.replace(/[^\d]/g, "");
  const query = new URLSearchParams({
    ...(env.MESSAGE_CENTRAL_CUSTOMER_ID
      ? { customerId: env.MESSAGE_CENTRAL_CUSTOMER_ID }
      : {}),
    countryCode: safeCountryCode,
    flowType: "SMS",
    mobileNumber: to,
    otpLength: "6",
  });

  const sendUrl = new URL(env.MESSAGE_CENTRAL_API_URL);
  sendUrl.pathname = "/verification/v3/send";
  sendUrl.search = query.toString();

  logger.debug("Message Central send OTP request", {
    url: sendUrl.toString(),
    to,
    countryCode,
  });

  const responseData = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      sendUrl,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          accept: "application/json",
          "Content-Length": 0,
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          logger.debug("Message Central send OTP response", {
            statusCode: res.statusCode,
            body: data,
          });
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            const error = new Error(
              `VerifyNow send request failed: ${res.statusCode} ${data}`,
            );
            logger.error("Message Central send request denied", {
              statusCode: res.statusCode,
              body: data,
            });
            reject(error);
          }
        });
      },
    );
    req.on("error", (error) => {
      logger.error("Message Central send request error", { error });
      reject(error);
    });
    req.end();
  });

  const json = JSON.parse(responseData) as {
    responseCode?: number | string;
    message?: string;
    data?: { verificationId?: string };
  };
  if (String(json.responseCode) !== "200" || !json.data?.verificationId) {
    throw new Error(
      `VerifyNow send failed: ${json.responseCode} ${json.message || "no message"}`,
    );
  }
  return { verificationId: json.data.verificationId };
}

async function validateViaVerifyNow(
  verificationId: string,
  code: string,
): Promise<boolean> {
  const authHeaders = await getMessageCentralAuthHeaders();
  const query = new URLSearchParams({
    verificationId,
    code,
  });

  const validateUrl = new URL(env.MESSAGE_CENTRAL_API_URL);
  validateUrl.pathname = "/verification/v3/validateOtp";
  validateUrl.search = query.toString();

  logger.debug("Message Central validate OTP request", {
    url: validateUrl.toString(),
    verificationId,
  });

  const responseData = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      validateUrl,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          accept: "application/json",
          "Content-Length": 0,
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          logger.debug("Message Central validate OTP response", {
            statusCode: res.statusCode,
            body: data,
          });
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            const error = new Error(
              `VerifyNow validate request failed: ${res.statusCode} ${data}`,
            );
            logger.error("Message Central validate request denied", {
              statusCode: res.statusCode,
              body: data,
            });
            reject(error);
          }
        });
      },
    );
    req.on("error", (error) => {
      logger.error("Message Central validate request error", { error });
      reject(error);
    });
    req.end();
  });

  const json = JSON.parse(responseData) as {
    responseCode?: number | string;
    message?: string;
    data?: { verificationStatus?: string };
  };

  return (
    String(json.responseCode) === "200" &&
    String(json.data?.verificationStatus).toUpperCase() ===
      "VERIFICATION_COMPLETED"
  );
}

function generateOTPCode(): string {
  // Cryptographically secure 6-digit OTP
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, "0");
}

export interface SendOTPResult {
  success: boolean;
  message: string;
  // In demo mode, return the OTP so frontend can use it
  otp?: string;
}

/**
 * Generates and sends an OTP to the given phone number.
 * In DEMO_MODE, returns the OTP directly without sending SMS.
 */
export async function sendOTP(
  phone: string,
  countryCode: string,
  userType: OTPUserType,
  purpose: OTPPurpose = "login",
): Promise<SendOTPResult> {
  // Sanitize inputs to prevent NoSQL injection
  const safePhone = String(phone).replace(/[^\d]/g, "");
  const safeCountryCode = String(countryCode).replace(/[^\d+]/g, "");
  const safeUserType = String(userType) as OTPUserType;

  // Invalidate any existing active OTP
  await OTP.updateMany(
    {
      phone: safePhone,
      countryCode: safeCountryCode,
      userType: safeUserType,
      isUsed: false,
    },
    { isUsed: true },
  );

  const code = env.DEMO_MODE ? env.DEMO_OTP : generateOTPCode();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

  if (!env.DEMO_MODE && !isMessageCentralConfigured()) {
    throw new Error("Message Central VerifyNow is not configured");
  }

  let externalVerificationId: string | undefined;
  if (!env.DEMO_MODE) {
    const result = await sendViaVerifyNow(
      `${safeCountryCode}${safePhone}`,
      safeCountryCode,
    );
    externalVerificationId = result.verificationId;
  }

  await OTP.create({
    phone: safePhone,
    countryCode: safeCountryCode,
    code: env.DEMO_MODE ? code : "",
    verificationId: externalVerificationId,
    purpose,
    userType: safeUserType,
    expiresAt,
  });

  if (env.DEMO_MODE) {
    logger.info(`[DEMO] OTP for ${safeCountryCode}${safePhone}: ${code}`);
    return { success: true, message: "OTP sent (demo mode)", otp: code };
  }

  return { success: true, message: "OTP sent successfully" };
}

export interface VerifyOTPResult {
  success: boolean;
  message: string;
}

/**
 * Verifies an OTP code for a given phone number.
 * Increments attempt counter on failure.
 */
export async function verifyOTP(
  phone: string,
  countryCode: string,
  code: string,
  userType: OTPUserType,
): Promise<VerifyOTPResult> {
  // Sanitize inputs to prevent NoSQL injection
  const safePhone = String(phone).replace(/[^\d]/g, "");
  const safeCountryCode = String(countryCode).replace(/[^\d+]/g, "");
  const safeCode = String(code).replace(/[^\d]/g, "");
  const safeUserType = String(userType) as OTPUserType;

  const otpRecord = await OTP.findOne({
    phone: safePhone,
    countryCode: safeCountryCode,
    userType: safeUserType,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return {
      success: false,
      message: "OTP expired or not found. Please request a new one.",
    };
  }

  if (otpRecord.attempts >= env.OTP_MAX_ATTEMPTS) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return {
      success: false,
      message: "Too many failed attempts. Please request a new OTP.",
    };
  }

  if (otpRecord.verificationId) {
    try {
      const valid = await validateViaVerifyNow(
        otpRecord.verificationId,
        safeCode,
      );
      if (!valid) {
        await OTP.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
        const remaining = env.OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
        return {
          success: false,
          message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
        };
      }
    } catch (error) {
      logger.error("VerifyNow validation failed:", error);
      await OTP.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
      const remaining = env.OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
      return {
        success: false,
        message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
      };
    }
  } else if (otpRecord.code !== safeCode) {
    await OTP.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
    const remaining = env.OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
    return {
      success: false,
      message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
    };
  }

  // Mark as used
  await OTP.updateOne({ _id: otpRecord._id }, { isUsed: true });
  return { success: true, message: "OTP verified successfully" };
}
