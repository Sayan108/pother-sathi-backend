import mongoose, { Document, Schema } from "mongoose";
import { CONTENT_MODULES, ContentModule } from "./ContentItem";

export interface IMediaAsset extends Document {
  _id: mongoose.Types.ObjectId;
  url: string;
  publicUrl: string;
  altTextBn?: string;
  altTextEn?: string;
  provider?: string;
  publicId?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  module?: ContentModule;
  tags: string[];
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const mediaAssetSchema = new Schema<IMediaAsset>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicUrl: {
      type: String,
      required: true,
      trim: true,
    },
    altTextBn: { type: String, trim: true },
    altTextEn: { type: String, trim: true },
    provider: { type: String, trim: true, default: "external" },
    publicId: { type: String, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    module: { type: String, enum: CONTENT_MODULES, index: true },
    tags: { type: [String], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

mediaAssetSchema.pre("validate", function (next) {
  this.publicUrl = this.publicUrl || this.url;
  next();
});

mediaAssetSchema.index({ isDeleted: 1, module: 1, createdAt: -1 });

export const MediaAsset = mongoose.model<IMediaAsset>(
  "MediaAsset",
  mediaAssetSchema,
);
