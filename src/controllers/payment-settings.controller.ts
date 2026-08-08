import { Request, Response } from "express";
import { body } from "express-validator";
import {
  DEFAULT_PAYMENT_SETTINGS,
  PAYMENT_SETTINGS_KEY,
  PaymentSettings,
} from "../models/PaymentSettings";
import { sendSuccess } from "../utils/response";

function toPublicSettings(doc: {
  merchantName: string;
  upiId: string;
  rechargeAmount: number;
  qrImageUrl?: string;
  updatedAt?: Date;
}) {
  return {
    merchantName: doc.merchantName,
    upiId: doc.upiId,
    rechargeAmount: doc.rechargeAmount,
    qrImageUrl: doc.qrImageUrl || "",
    updatedAt: doc.updatedAt ?? null,
  };
}

export async function getOrCreatePaymentSettings() {
  let settings = await PaymentSettings.findOne({ key: PAYMENT_SETTINGS_KEY });
  if (!settings) {
    settings = await PaymentSettings.create({
      key: PAYMENT_SETTINGS_KEY,
      ...DEFAULT_PAYMENT_SETTINGS,
    });
  }
  return settings;
}

/**
 * GET /api/admin/payment-settings
 * GET /api/driver/payment-settings
 */
export async function getPaymentSettings(
  _req: Request,
  res: Response,
): Promise<void> {
  const settings = await getOrCreatePaymentSettings();
  sendSuccess(res, "Payment settings fetched", toPublicSettings(settings));
}

/**
 * PUT /api/admin/payment-settings
 */
export async function updatePaymentSettings(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    merchantName,
    upiId,
    rechargeAmount,
    qrImageUrl,
  } = req.body as {
    merchantName?: string;
    upiId?: string;
    rechargeAmount?: number;
    qrImageUrl?: string | null;
  };

  const settings = await getOrCreatePaymentSettings();

  if (typeof merchantName === "string" && merchantName.trim()) {
    settings.merchantName = merchantName.trim();
  }
  if (typeof upiId === "string" && upiId.trim()) {
    settings.upiId = upiId.trim();
  }
  if (typeof rechargeAmount === "number" && Number.isFinite(rechargeAmount)) {
    settings.rechargeAmount = rechargeAmount;
  }
  if (qrImageUrl !== undefined) {
    settings.qrImageUrl = qrImageUrl ? String(qrImageUrl).trim() : "";
  }
  settings.updatedBy = req.user!.id as any;
  await settings.save();

  sendSuccess(res, "Payment settings updated", toPublicSettings(settings));
}

export const updatePaymentSettingsValidation = [
  body("merchantName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("merchantName cannot be empty")
    .isLength({ max: 120 })
    .withMessage("merchantName must be 120 characters or fewer"),
  body("upiId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("upiId cannot be empty")
    .isLength({ max: 120 })
    .withMessage("upiId must be 120 characters or fewer"),
  body("rechargeAmount")
    .optional()
    .isFloat({ min: 1, max: 10000 })
    .withMessage("rechargeAmount must be between 1 and 10000"),
  body("qrImageUrl")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === "") return true;
      if (typeof value !== "string") {
        throw new Error("qrImageUrl must be a string");
      }
      try {
        // eslint-disable-next-line no-new
        new URL(value);
        return true;
      } catch {
        throw new Error("qrImageUrl must be a valid URL");
      }
    }),
];
