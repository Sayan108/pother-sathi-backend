import mongoose, { Document, Schema } from "mongoose";

export type RechargeRequestStatus = "pending" | "approved" | "rejected";

export interface IRechargeRequest extends Document {
  _id: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  amount: number;
  paymentReference?: string;
  status: RechargeRequestStatus;
  description: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rechargeRequestSchema = new Schema<IRechargeRequest>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Driver",
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    paymentReference: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

rechargeRequestSchema.index({ driverId: 1, status: 1, createdAt: -1 });

export const RechargeRequest = mongoose.model<IRechargeRequest>(
  "RechargeRequest",
  rechargeRequestSchema,
);
