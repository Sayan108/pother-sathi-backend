import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { env } from "../config/environment";
import { Driver } from "../models/Driver";
import { User } from "../models/User";
import { logger } from "../utils/logger";

/** Must match the Android notification channel created by the Capacitor apps. */
export const FCM_ANDROID_CHANNEL_ID = "pothersathi_rides";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  configured: boolean;
  requested: number;
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

export function getStoredTokens(user: {
  fcmToken?: string;
  fcmTokens?: string[];
}) {
  return [
    ...(Array.isArray(user.fcmTokens) ? user.fcmTokens : []),
    user.fcmToken,
  ].filter((token): token is string => Boolean(token));
}

function toStringData(
  data?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> | undefined {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

export async function removeInvalidPushTokens(tokens: string[]) {
  if (tokens.length === 0) return;

  await Promise.all([
    User.updateMany({}, { $pull: { fcmTokens: { $in: tokens } } }),
    User.updateMany({ fcmToken: { $in: tokens } }, { $unset: { fcmToken: "" } }),
    Driver.updateMany({}, { $pull: { fcmTokens: { $in: tokens } } }),
    Driver.updateMany(
      { fcmToken: { $in: tokens } },
      { $unset: { fcmToken: "" } },
    ),
  ]);
}

export async function clearPushToken(
  role: "rider" | "driver",
  userId: string,
  fcmToken: string,
) {
  if (role === "rider") {
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: fcmToken },
      $unset: { fcmToken: "" },
    });
    return;
  }

  await Driver.findByIdAndUpdate(userId, {
    $pull: { fcmTokens: fcmToken },
    $unset: { fcmToken: "" },
  });
}

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];

  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
      });
    }

    if (!env.FIREBASE_USE_ADC) return null;

    const hasAdcSignal = Boolean(
      process.env.FIREBASE_USE_ADC === "true" ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET ||
        process.env.GAE_SERVICE ||
        process.env.FIREBASE_CONFIG,
    );
    if (!hasAdcSignal) return null;

    return initializeApp({
      credential: applicationDefault(),
      projectId: env.FIREBASE_PROJECT_ID || undefined,
    });
  } catch (error) {
    logger.error("Firebase Admin initialization failed", { error });
    return null;
  }
}

export function isPushConfigured() {
  return Boolean(getFirebaseApp());
}

export async function sendPushToTokens(
  tokens: string[],
  payload: PushPayload,
): Promise<PushSendResult> {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (uniqueTokens.length === 0) {
    return {
      configured: isPushConfigured(),
      requested: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [] as string[],
    };
  }

  const app = getFirebaseApp();
  if (!app) {
    logger.warn("FCM fallback skipped: Firebase Admin is not configured");
    return {
      configured: false,
      requested: uniqueTokens.length,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [] as string[],
    };
  }

  const message: MulticastMessage = {
    tokens: uniqueTokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: toStringData(payload.data),
    android: {
      priority: "high",
      notification: {
        channelId: FCM_ANDROID_CHANNEL_ID,
        sound: "default",
        priority: "high",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };

  let response;
  try {
    response = await getMessaging(app).sendEachForMulticast(message);
  } catch (error) {
    logger.error("FCM send failed", { error });
    return {
      configured: true,
      requested: uniqueTokens.length,
      successCount: 0,
      failureCount: uniqueTokens.length,
      invalidTokens: [] as string[],
    };
  }
  const invalidTokens = response.responses
    .map((result, index) => ({ result, token: uniqueTokens[index] }))
    .filter(({ result }) => {
      const code = result.error?.code;
      return (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      );
    })
    .map(({ token }) => token);

  return {
    configured: true,
    requested: uniqueTokens.length,
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  };
}

export async function sendPushToRider(
  riderId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  const rider = await User.findById(riderId).select("fcmToken fcmTokens").lean();
  const result = await sendPushToTokens(
    rider ? getStoredTokens(rider) : [],
    payload,
  );
  await removeInvalidPushTokens(result.invalidTokens);
  return result;
}

export async function sendPushToDriver(
  driverId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  const driver = await Driver.findById(driverId)
    .select("fcmToken fcmTokens")
    .lean();
  const result = await sendPushToTokens(
    driver ? getStoredTokens(driver) : [],
    payload,
  );
  await removeInvalidPushTokens(result.invalidTokens);
  return result;
}
