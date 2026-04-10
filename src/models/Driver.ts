import mongoose, { Document, Schema, Model } from 'mongoose';

export type VehicleType = 'bike' | 'auto' | 'toto' | 'car' | 'delivery';
export type DriverStatus = 'incomplete' | 'pending' | 'verified' | 'rejected' | 'suspended';

export interface IDriver extends Document {
  _id: mongoose.Types.ObjectId;
  phone: string;
  countryCode: string;
  name: string;
  email?: string;
  avatar?: string;
  dob?: Date;
  gender?: 'male' | 'female' | 'other';
  nidNumber?: string;

  // Vehicle
  vehicleType: VehicleType;
  vehicleModel: string;
  vehicleNumber: string;
  vehicleColor?: string;
  vehicleYear?: string;

  // Documents
  licenseNumber?: string;
  licenseExpiry?: Date;
  nidDocument?: string;   // URL
  licenseDocument?: string; // URL
  vehicleDocument?: string; // URL

  // Location (GeoJSON for proximity queries)
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  serviceArea?: string;

  // Status
  accountStatus: DriverStatus;
  isOnline: boolean;
  isAvailable: boolean;
  currentRideId?: mongoose.Types.ObjectId;
  fcmToken?: string;

  // Finance
  walletBalance: number;
  totalEarnings: number;

  // Ratings
  rating: number;
  totalRatings: number;
  totalRides: number;

  // Socket
  socketId?: string;

  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDriverModel extends Model<IDriver> {
  findByPhone(phone: string, countryCode?: string): Promise<IDriver | null>;
  findNearby(
    lat: number,
    lng: number,
    radiusKm: number,
    vehicleType?: VehicleType
  ): Promise<IDriver[]>;
}

const driverSchema = new Schema<IDriver>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{10,15}$/, 'Invalid phone number'],
    },
    countryCode: { type: String, default: '+91' },
    name: { type: String,  trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    avatar: { type: String },
    dob: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    nidNumber: { type: String },

    vehicleType: {
      type: String,
     
      enum: ['bike', 'auto', 'toto', 'car', 'delivery'],
    },
    vehicleModel: { type: String },
    vehicleNumber: { type: String,  uppercase: true },
    vehicleColor: { type: String },
    vehicleYear: { type: String },

    licenseNumber: { type: String },
    licenseExpiry: { type: Date },
    nidDocument: { type: String },
    licenseDocument: { type: String },
    vehicleDocument: { type: String },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [88.3639, 22.5726], // Default: Kolkata
      },
    },
    serviceArea: { type: String },

    accountStatus: {
      type: String,
      enum: [  'incomplete', 'pending', 'verified', 'rejected', 'suspended'],
      default: 'incomplete',
    },
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: false },
    currentRideId: { type: Schema.Types.ObjectId, ref: 'Ride' },
    fcmToken: { type: String },
    socketId: { type: String },

    walletBalance: { type: Number, default: 0, min: 0 },
    totalEarnings: { type: Number, default: 0 },

    rating: { type: Number, default: 5.0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

driverSchema.index({ location: '2dsphere' });
driverSchema.index({ isOnline: 1, isAvailable: 1, accountStatus: 1 });

driverSchema.statics.findByPhone = function (
  phone: string,
  countryCode = '+91'
): Promise<IDriver | null> {
  return this.findOne({ phone, countryCode });
};

driverSchema.statics.findNearby = function (
  lat: number,
  lng: number,
  radiusKm: number,
  vehicleType?: VehicleType
): Promise<IDriver[]> {
  const query: Record<string, unknown> = {
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
    isOnline: true,
    isAvailable: true,
    accountStatus: 'verified',
  };
  if (vehicleType) query.vehicleType = vehicleType;
  return this.find(query).limit(10).exec();
};

driverSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.fcmToken;
  delete obj.socketId;
  return obj;
};

export const Driver = mongoose.model<IDriver, IDriverModel>('Driver', driverSchema);
