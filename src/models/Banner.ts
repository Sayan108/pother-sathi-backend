import mongoose, { Document, Schema } from "mongoose";

export type BannerAudience = "user" | "driver";
export type BannerStatus = "active" | "inactive";

export interface IBanner extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  audience: BannerAudience;
  status: BannerStatus;
  isActive: boolean;
  sortOrder: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBanner>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    linkUrl: {
      type: String,
      trim: true,
    },
    audience: {
      type: String,
      enum: ["user", "driver"],
      default: "user",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: Date,
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bannerSchema.pre("validate", function (next) {
  this.isActive = this.status === "active";
  next();
});

bannerSchema.index({ audience: 1, isDeleted: 1, sortOrder: 1, createdAt: -1 });

export const Banner = mongoose.model<IBanner>("Banner", bannerSchema);
