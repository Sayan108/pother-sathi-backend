import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  phone: string;
  countryCode: string;
  name?: string;
  email?: string;
  avatar?: string;
  dob?: Date;
  gender?: 'male' | 'female' | 'other';
  rating: number;
  totalRatings: number;
  totalRides: number;
  isActive: boolean;
  isVerified: boolean;
  fcmToken?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePhone(phone: string): boolean;
}

export interface IUserModel extends Model<IUser> {
  findByPhone(phone: string, countryCode?: string): Promise<IUser | null>;
}

const userSchema = new Schema<IUser>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{10,15}$/, 'Invalid phone number'],
    },
    countryCode: {
      type: String,
      default: '+91',
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    avatar: { type: String },
    dob: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    rating: { type: Number, default: 5.0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    fcmToken: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.statics.findByPhone = function (
  phone: string,
  countryCode = '+91'
): Promise<IUser | null> {
  return this.findOne({ phone, countryCode });
};

userSchema.methods.comparePhone = function (phone: string): boolean {
  return this.phone === phone;
};

// Never return sensitive data
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.fcmToken;
  return obj;
};

export const User = mongoose.model<IUser, IUserModel>('User', userSchema);
