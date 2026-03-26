import crypto from 'crypto';
import { OTP, OTPPurpose, OTPUserType } from '../models/OTP';
import { env } from '../config/environment';
import { logger } from '../utils/logger';

let twilioClient: ReturnType<typeof import('twilio')> | null = null;

async function getTwilioClient() {
  if (!twilioClient && !env.DEMO_MODE && env.TWILIO_ACCOUNT_SID) {
    const twilio = (await import('twilio')).default;
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

function generateOTPCode(): string {
  // Cryptographically secure 6-digit OTP
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
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
  purpose: OTPPurpose = 'login'
): Promise<SendOTPResult> {
  // Invalidate any existing active OTP
  await OTP.updateMany(
    { phone, countryCode, userType, isUsed: false },
    { isUsed: true }
  );

  const code = env.DEMO_MODE ? env.DEMO_OTP : generateOTPCode();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

  await OTP.create({ phone, countryCode, code, purpose, userType, expiresAt });

  if (env.DEMO_MODE) {
    logger.info(`[DEMO] OTP for ${countryCode}${phone}: ${code}`);
    return { success: true, message: 'OTP sent (demo mode)', otp: code };
  }

  try {
    const client = await getTwilioClient();
    if (!client) throw new Error('Twilio client unavailable');
    await client.messages.create({
      body: `Your Pather Sathi OTP is: ${code}. Valid for ${env.OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
      from: env.TWILIO_PHONE_NUMBER,
      to: `${countryCode}${phone}`,
    });
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    logger.error('Failed to send OTP via Twilio:', error);
    // Delete the unused OTP on send failure
    await OTP.deleteMany({ phone, countryCode, userType, isUsed: false });
    throw new Error('Failed to send OTP. Please try again.');
  }
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
  userType: OTPUserType
): Promise<VerifyOTPResult> {
  const otpRecord = await OTP.findOne({
    phone,
    countryCode,
    userType,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return { success: false, message: 'OTP expired or not found. Please request a new one.' };
  }

  if (otpRecord.attempts >= env.OTP_MAX_ATTEMPTS) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
  }

  if (otpRecord.code !== code) {
    await OTP.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
    const remaining = env.OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
    return {
      success: false,
      message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
    };
  }

  // Mark as used
  await OTP.updateOne({ _id: otpRecord._id }, { isUsed: true });
  return { success: true, message: 'OTP verified successfully' };
}
