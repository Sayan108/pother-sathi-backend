import mongoose, { Document, Schema } from "mongoose";

export const CONTENT_MODULES = [
  "home-sections",
  "festivals",
  "rituals",
  "articles",
  "temples",
  "products",
  "packages",
  "categories",
  "festival-collections",
  "faqs",
  "testimonials",
  "notifications",
  "checklists",
  "collections",
  "daily-wisdom-cards",
  "guidance-quick-cards",
  "panchang",
  "pages",
] as const;

export type ContentModule = (typeof CONTENT_MODULES)[number];
export type ContentState = "draft" | "saved" | "published";

type RevisionSnapshot = Record<string, unknown>;

export interface IContentRevision {
  version: number;
  changedAt: Date;
  changedBy?: mongoose.Types.ObjectId;
  snapshot: RevisionSnapshot;
}

export interface IContentItem extends Document {
  _id: mongoose.Types.ObjectId;
  module: ContentModule;
  slug?: string;
  titleBn?: string;
  titleEn?: string;
  subtitleBn?: string;
  subtitleEn?: string;
  eyebrowBn?: string;
  eyebrowEn?: string;
  excerptBn?: string;
  excerptEn?: string;
  descriptionBn?: string;
  descriptionEn?: string;
  contentBn?: string;
  contentEn?: string;
  bodyBn?: string;
  bodyEn?: string;
  nameBn?: string;
  nameEn?: string;
  shortDescBn?: string;
  shortDescEn?: string;
  ctaLabelBn?: string;
  ctaLabelEn?: string;
  ctaPage?: string;
  image?: string;
  imageAltBn?: string;
  imageAltEn?: string;
  bannerImage?: string;
  bannerImageAltBn?: string;
  bannerImageAltEn?: string;
  heroImage?: string;
  heroImageAltBn?: string;
  heroImageAltEn?: string;
  price?: number;
  originalPrice?: number;
  category?: string;
  inStock?: boolean;
  isBestSeller?: boolean;
  isActive: boolean;
  isPublished: boolean;
  publishedAt?: Date;
  state: ContentState;
  order: number;
  sections?: unknown[];
  contact?: Record<string, unknown>;
  data?: Record<string, unknown>;
  revisions: IContentRevision[];
  revision: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

const revisionSchema = new Schema<IContentRevision>(
  {
    version: { type: Number, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false, versionKey: false },
);

const contentItemSchema = new Schema<IContentItem>(
  {
    module: {
      type: String,
      enum: CONTENT_MODULES,
      required: true,
      index: true,
    },
    slug: { type: String, trim: true, lowercase: true },
    titleBn: { type: String, trim: true },
    titleEn: { type: String, trim: true },
    subtitleBn: { type: String, trim: true },
    subtitleEn: { type: String, trim: true },
    eyebrowBn: { type: String, trim: true },
    eyebrowEn: { type: String, trim: true },
    excerptBn: { type: String, trim: true },
    excerptEn: { type: String, trim: true },
    descriptionBn: { type: String, trim: true },
    descriptionEn: { type: String, trim: true },
    contentBn: { type: String },
    contentEn: { type: String },
    bodyBn: { type: String },
    bodyEn: { type: String },
    nameBn: { type: String, trim: true },
    nameEn: { type: String, trim: true },
    shortDescBn: { type: String, trim: true },
    shortDescEn: { type: String, trim: true },
    ctaLabelBn: { type: String, trim: true },
    ctaLabelEn: { type: String, trim: true },
    ctaPage: { type: String, trim: true },
    image: { type: String, trim: true },
    imageAltBn: { type: String, trim: true },
    imageAltEn: { type: String, trim: true },
    bannerImage: { type: String, trim: true },
    bannerImageAltBn: { type: String, trim: true },
    bannerImageAltEn: { type: String, trim: true },
    heroImage: { type: String, trim: true },
    heroImageAltBn: { type: String, trim: true },
    heroImageAltEn: { type: String, trim: true },
    price: { type: Number, min: 0 },
    originalPrice: { type: Number, min: 0 },
    category: { type: String, trim: true },
    inStock: { type: Boolean, default: true },
    isBestSeller: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    state: {
      type: String,
      enum: ["draft", "saved", "published"],
      default: "draft",
      index: true,
    },
    order: { type: Number, default: 0 },
    sections: { type: [Schema.Types.Mixed], default: undefined },
    contact: { type: Schema.Types.Mixed },
    data: { type: Schema.Types.Mixed },
    revisions: { type: [revisionSchema], default: [] },
    revision: { type: Number, default: 1, min: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    strict: false,
    timestamps: true,
    versionKey: false,
  },
);

contentItemSchema.pre("validate", function (next) {
  if (this.isPublished) {
    this.state = "published";
    if (!this.publishedAt) this.publishedAt = new Date();
  } else if (this.state === "published") {
    this.isPublished = true;
    if (!this.publishedAt) this.publishedAt = new Date();
  }
  next();
});

contentItemSchema.index(
  { module: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      slug: { $exists: true, $type: "string" },
      isDeleted: { $eq: false },
    },
  },
);
contentItemSchema.index({
  module: 1,
  isDeleted: 1,
  isPublished: 1,
  isActive: 1,
  order: 1,
  createdAt: -1,
});

export const ContentItem = mongoose.model<IContentItem>(
  "ContentItem",
  contentItemSchema,
);
