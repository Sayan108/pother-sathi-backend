import mongoose, { Document, Schema } from 'mongoose';

export type OTPPurpose = 'login' | 'register' | 'verification';
export type OTPUserType = 'rider' | 'driver';

export interface IOTP extends Document {
  _id: mongoose.Types.ObjectId;
  phone: string;
  countryCode: string;
  code: string;
  purpose: OTPPurpose;
  userType: OTPUserType;
  attempts: number;
  isUsed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const otpSchema = new Schema<IOTP>(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{10,15}$/, 'Invalid phone number'],
    },
    countryCode: { type: String, default: '+91' },
    code: { type: String, required: true },
    purpose: {
      type: String,
      enum: ['login', 'register', 'verification'],
      default: 'login',
    },
    userType: {
      type: String,
      enum: ['rider', 'driver'],
      required: true,
    },
    attempts: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Auto-delete expired OTPs via TTL index
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ phone: 1, countryCode: 1, userType: 1 });

export const OTP = mongoose.model<IOTP>('OTP', otpSchema);
