import mongoose, { Document, Schema } from "mongoose";
import { VehicleType } from "./Driver";

export interface IBasePrice extends Document {
  _id: mongoose.Types.ObjectId;
  vehicleType: VehicleType;
  basePrice: number;
  pricePerKm: number;
  minimumFare: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const basePriceSchema = new Schema<IBasePrice>(
  {
    vehicleType: {
      type: String,
      required: true,
      unique: true,
      enum: ["bike", "auto", "toto", "car", "delivery"],
    },
    basePrice: { type: Number, required: true, min: 0 },
    pricePerKm: { type: Number, required: true, min: 0 },
    minimumFare: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const BasePrice = mongoose.model<IBasePrice>(
  "BasePrice",
  basePriceSchema,
);
