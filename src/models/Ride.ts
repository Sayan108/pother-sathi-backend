import mongoose, { Document, Schema } from 'mongoose';
import { VehicleType } from './Driver';

export type RideStatus =
  | 'searching'       // Rider booked, looking for driver
  | 'driver_assigned' // Driver accepted
  | 'driver_arrived'  // Driver at pickup
  | 'otp_verified'    // OTP verified, ride started
  | 'in_progress'     // Rider in vehicle
  | 'completed'       // Ride done
  | 'cancelled'       // Cancelled by rider/driver
  | 'no_driver';      // No driver found

export type PaymentMethod = 'cash' | 'wallet' | 'upi';
export type CancelledBy = 'rider' | 'driver' | 'system';

export interface ICoordinate {
  lat: number;
  lng: number;
  address?: string;
}

export interface IRide extends Document {
  _id: mongoose.Types.ObjectId;
  riderId: mongoose.Types.ObjectId;
  driverId?: mongoose.Types.ObjectId;

  pickup: ICoordinate;
  drop: ICoordinate;
  distance?: number;       // km
  duration?: number;       // minutes (estimated)

  vehicleType: VehicleType;
  status: RideStatus;

  fare: number;
  platformFee: number;
  driverEarning: number;
  discount: number;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  isPaid: boolean;

  otp: string;
  otpVerifiedAt?: Date;

  riderRating?: number;
  driverRating?: number;
  riderReview?: string;
  driverReview?: string;

  cancelledBy?: CancelledBy;
  cancellationReason?: string;
  cancelledAt?: Date;

  driverAssignedAt?: Date;
  driverArrivedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Track driver path during ride
  driverPath: Array<{ lat: number; lng: number; timestamp: Date }>;

  createdAt: Date;
  updatedAt: Date;
}

const coordinateSchema = new Schema<ICoordinate>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String },
  },
  { _id: false }
);

const rideSchema = new Schema<IRide>(
  {
    riderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'Driver' },

    pickup: { type: coordinateSchema, required: true },
    drop: { type: coordinateSchema, required: true },
    distance: { type: Number },
    duration: { type: Number },

    vehicleType: {
      type: String,
      required: true,
      enum: ['bike', 'auto', 'toto', 'car', 'delivery'],
    },

    status: {
      type: String,
      enum: [
        'searching',
        'driver_assigned',
        'driver_arrived',
        'otp_verified',
        'in_progress',
        'completed',
        'cancelled',
        'no_driver',
      ],
      default: 'searching',
    },

    fare: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, default: 0 },
    driverEarning: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, uppercase: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'wallet', 'upi'],
      default: 'cash',
    },
    isPaid: { type: Boolean, default: false },

    otp: { type: String, required: true, length: 4 },
    otpVerifiedAt: { type: Date },

    riderRating: { type: Number, min: 1, max: 5 },
    driverRating: { type: Number, min: 1, max: 5 },
    riderReview: { type: String, maxlength: 500 },
    driverReview: { type: String, maxlength: 500 },

    cancelledBy: { type: String, enum: ['rider', 'driver', 'system'] },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },

    driverAssignedAt: { type: Date },
    driverArrivedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },

    driverPath: [
      {
        lat: Number,
        lng: Number,
        timestamp: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

rideSchema.index({ riderId: 1, status: 1 });
rideSchema.index({ driverId: 1, status: 1 });
rideSchema.index({ status: 1, createdAt: -1 });

export const Ride = mongoose.model<IRide>('Ride', rideSchema);
