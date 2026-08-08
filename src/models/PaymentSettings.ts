import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentSettings extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  merchantName: string;
  upiId: string;
  rechargeAmount: number;
  qrImageUrl?: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_KEY = "default";

const paymentSettingsSchema = new Schema<IPaymentSettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: DEFAULT_KEY,
      index: true,
    },
    merchantName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      default: "Pather Sathi",
    },
    upiId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      default: "9382325735-3@ybl",
    },
    rechargeAmount: {
      type: Number,
      required: true,
      min: 1,
      max: 10000,
      default: 500,
    },
    qrImageUrl: {
      type: String,
      trim: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export const PaymentSettings = mongoose.model<IPaymentSettings>(
  "PaymentSettings",
  paymentSettingsSchema,
);

export const PAYMENT_SETTINGS_KEY = DEFAULT_KEY;

export const DEFAULT_PAYMENT_SETTINGS = {
  merchantName: "Pather Sathi",
  upiId: "9382325735-3@ybl",
  rechargeAmount: 500,
  qrImageUrl: "",
} as const;
