import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { env } from "../config/environment";
import { logger } from "../utils/logger";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
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

export async function sendPushToTokens(tokens: string[], payload: PushPayload) {
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
    data: payload.data,
    android: {
      priority: "high",
      notification: {
        channelId: "default",
        sound: "default",
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
