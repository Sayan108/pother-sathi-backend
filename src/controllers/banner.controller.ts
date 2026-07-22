import { Request, Response } from "express";
import { Banner } from "../models/Banner";
import { sendSuccess } from "../utils/response";

export async function getActiveUserBanners(
  _req: Request,
  res: Response,
): Promise<void> {
  const banners = await Banner.find({
    audience: "user",
    status: "active",
    isActive: true,
    isDeleted: { $ne: true },
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .select("title imageUrl linkUrl audience status sortOrder createdAt updatedAt")
    .lean();

  sendSuccess(res, "User banners fetched", { banners });
}
