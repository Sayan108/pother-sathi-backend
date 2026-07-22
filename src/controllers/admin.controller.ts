import mongoose from "mongoose";
import { Request, Response } from "express";
import { User } from "../models/User";
import { Driver } from "../models/Driver";
import { Ride } from "../models/Ride";
import { BasePrice } from "../models/BasePrice";
import { Banner } from "../models/Banner";
import { VehicleType } from "../models/Driver";
import { RechargeRequest } from "../models/RechargeRequest";
import { Transaction } from "../models/Transaction";
import { env } from "../config/environment";
import { sendSuccess, sendError, sendNotFound } from "../utils/response";
import { DEFAULT_FARE_CONFIG } from "../services/fare.service";
import { getIO } from "../config/socket";
import { sendPushToTokens } from "../services/push-notification.service";

type AdminDriverListItem = {
  aadhaarNumber?: string;
  aadhaarDocument?: string;
  licenseNumber?: string;
  licenseExpiry?: Date;
  licenseDocument?: string;
  selfieDocument?: string;
  vehicleDocument?: string;
  kycStatus?: string;
  kycRejectionReason?: string;
  [key: string]: unknown;
};

function withKycDocuments<T extends AdminDriverListItem>(driver: T): T {
  return {
    ...driver,
    kycDocuments: {
      aadhaarDocument: driver.aadhaarDocument,
      licenseDocument: driver.licenseDocument,
      selfieDocument: driver.selfieDocument,
      vehicleDocument: driver.vehicleDocument,
    },
  };
}

function withKycDetails<T extends AdminDriverListItem>(driver: T): T {
  return {
    ...withKycDocuments(driver),
    kycDetails: {
      aadhaarNumber: driver.aadhaarNumber,
      licenseNumber: driver.licenseNumber,
      licenseExpiry: driver.licenseExpiry,
      status: driver.kycStatus,
      rejectionReason: driver.kycRejectionReason,
    },
  };
}

function getPagination(req: Request, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit as string) || defaultLimit, 1),
    maxLimit,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

const VEHICLE_TYPES = Object.keys(DEFAULT_FARE_CONFIG) as VehicleType[];
const MAX_USER_BANNERS = 10;

function isVehicleType(value: unknown): value is VehicleType {
  return (
    typeof value === "string" && VEHICLE_TYPES.includes(value as VehicleType)
  );
}

async function ensureDefaultBasePrices() {
  await Promise.all(
    VEHICLE_TYPES.map((vehicleType) =>
      BasePrice.updateOne(
        { vehicleType },
        {
          $setOnInsert: {
            vehicleType,
            ...DEFAULT_FARE_CONFIG[vehicleType],
            isActive: true,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

function getStoredTokens(user: { fcmToken?: string; fcmTokens?: string[] }) {
  return [
    ...(Array.isArray(user.fcmTokens) ? user.fcmTokens : []),
    user.fcmToken,
  ].filter((token): token is string => Boolean(token));
}

async function removeInvalidTokens(tokens: string[]) {
  if (tokens.length === 0) return;

  await Promise.all([
    User.updateMany({}, { $pull: { fcmTokens: { $in: tokens } } }),
    User.updateMany({ fcmToken: { $in: tokens } }, { $unset: { fcmToken: "" } }),
    Driver.updateMany({}, { $pull: { fcmTokens: { $in: tokens } } }),
    Driver.updateMany({ fcmToken: { $in: tokens } }, { $unset: { fcmToken: "" } }),
  ]);
}

async function resolveNotificationRecipients(
  recipientType: string,
  recipientId?: string,
) {
  if (recipientType === "rider") {
    if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
      return { error: "A valid rider recipientId is required" };
    }
    const rider = await User.findOne({
      _id: recipientId,
      role: "rider",
      isDeleted: { $ne: true },
    })
      .select("name phone fcmToken fcmTokens")
      .lean();
    if (!rider) return { error: "Rider not found", notFound: true };
    return {
      recipients: [{ ...rider, role: "rider" as const }],
      rooms: [`rider:${rider._id.toString()}`],
    };
  }

  if (recipientType === "driver") {
    if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
      return { error: "A valid driver recipientId is required" };
    }
    const driver = await Driver.findOne({
      _id: recipientId,
      isDeleted: { $ne: true },
    })
      .select("name phone fcmToken fcmTokens")
      .lean();
    if (!driver) return { error: "Driver not found", notFound: true };
    return {
      recipients: [{ ...driver, role: "driver" as const }],
      rooms: [`driver:${driver._id.toString()}`],
    };
  }

  if (recipientType === "all_riders") {
    const riders = await User.find({
      role: "rider",
      isDeleted: { $ne: true },
    })
      .select("name phone fcmToken fcmTokens")
      .lean();
    return {
      recipients: riders.map((rider) => ({ ...rider, role: "rider" as const })),
      rooms: ["riders"],
    };
  }

  if (recipientType === "all_drivers") {
    const drivers = await Driver.find({
      isDeleted: { $ne: true },
    })
      .select("name phone fcmToken fcmTokens")
      .lean();
    return {
      recipients: drivers.map((driver) => ({ ...driver, role: "driver" as const })),
      rooms: ["drivers"],
    };
  }

  if (recipientType === "all") {
    const [riders, drivers] = await Promise.all([
      User.find({
        role: "rider",
        isDeleted: { $ne: true },
      })
        .select("name phone fcmToken fcmTokens")
        .lean(),
      Driver.find({
        isDeleted: { $ne: true },
      })
        .select("name phone fcmToken fcmTokens")
        .lean(),
    ]);
    return {
      recipients: [
        ...riders.map((rider) => ({ ...rider, role: "rider" as const })),
        ...drivers.map((driver) => ({ ...driver, role: "driver" as const })),
      ],
      rooms: ["riders", "drivers"],
    };
  }

  return { error: "Invalid recipientType" };
}

export async function sendNotification(
  req: Request,
  res: Response,
): Promise<void> {
  const { title, body, recipientType, recipientId, data } = req.body as {
    title: string;
    body: string;
    recipientType: "rider" | "driver" | "all_riders" | "all_drivers" | "all";
    recipientId?: string;
    data?: Record<string, unknown>;
  };

  const resolved = await resolveNotificationRecipients(
    recipientType,
    recipientId,
  );
  if (resolved.error) {
    if (resolved.notFound) sendNotFound(res, resolved.error);
    else sendError(res, resolved.error, 400);
    return;
  }

  const stringData = Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => [key, String(value)]),
  );

  const payload = {
    title,
    body,
    data: {
      type: "admin_notification",
      ...stringData,
    },
    sentAt: new Date().toISOString(),
  };

  let onlineCount = 0;
  let onlineRecipientIds = new Set<string>();
  let fcmResult = {
    configured: false,
    requested: 0,
    successCount: 0,
    failureCount: 0,
    invalidTokens: [] as string[],
  };

  try {
    const io = getIO();
    const rooms = resolved.rooms ?? [];
    const sockets = await io.in(rooms).fetchSockets();
    onlineCount = sockets.length;
    onlineRecipientIds = new Set(
      sockets
        .map((socket) => (socket as any).userId)
        .filter((id): id is string => Boolean(id)),
    );

    rooms.forEach((room) => {
      io.to(room).emit("admin:notification", payload);
    });
  } catch {
    onlineCount = 0;
  }

  const offlineTokens = (resolved.recipients ?? [])
    .filter((recipient: any) => !onlineRecipientIds.has(recipient._id.toString()))
    .flatMap((recipient: any) => getStoredTokens(recipient));

  fcmResult = await sendPushToTokens(offlineTokens, {
    title,
    body,
    data: payload.data,
  });
  await removeInvalidTokens(fcmResult.invalidTokens);

  sendSuccess(res, "Notification processed", {
    recipientCount: resolved.recipients?.length ?? 0,
    onlineCount,
    socketDeliveredCount: onlineCount,
    fcmConfigured: fcmResult.configured,
    fcmTokenCount: fcmResult.requested,
    fcmSuccessCount: fcmResult.successCount,
    fcmFailureCount: fcmResult.failureCount,
    deliveredCount: onlineCount + fcmResult.successCount,
    event: "admin:notification",
  });
}

function normalizeBannerStatus(body: Record<string, unknown>) {
  const explicitStatus =
    typeof body.status === "string" ? body.status.toLowerCase() : undefined;
  const isActive =
    typeof body.isActive === "boolean"
      ? body.isActive
      : typeof body.active === "boolean"
        ? body.active
        : undefined;

  if (explicitStatus === "inactive" || explicitStatus === "paused") {
    return "inactive" as const;
  }
  if (explicitStatus === "active") {
    return "active" as const;
  }
  if (isActive !== undefined) {
    return isActive ? ("active" as const) : ("inactive" as const);
  }
  return "active" as const;
}

function normalizeBannerUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCloudinaryUrl(value: string) {
  return /^https?:\/\/res\.cloudinary\.com\//i.test(value);
}

function getBannerQuery(req: Request) {
  const audience = req.query.audience === "driver" ? "driver" : "user";
  const includeDeleted = req.query.includeDeleted === "true";
  const filter: Record<string, unknown> = { audience };

  if (!includeDeleted) {
    filter.isDeleted = { $ne: true };
  }

  return filter;
}

export async function getBanners(req: Request, res: Response): Promise<void> {
  const filter = getBannerQuery(req);
  const banners = await Banner.find(filter)
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  sendSuccess(res, "Banners fetched", { banners });
}

export async function createBanner(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const imageUrl = normalizeBannerUrl(
    body.imageUrl || body.bannerUrl || body.image || body.url,
  );
  const linkUrl = normalizeBannerUrl(
    body.linkUrl || body.redirectUrl || body.targetUrl,
  );
  const audience = body.audience === "driver" ? "driver" : "user";

  if (!title) {
    sendError(res, "Banner title is required", 400);
    return;
  }

  if (!imageUrl || !isHttpUrl(imageUrl)) {
    sendError(res, "A valid banner image URL is required", 400);
    return;
  }

  if (!isCloudinaryUrl(imageUrl)) {
    sendError(res, "Banner image must be a Cloudinary URL", 400);
    return;
  }

  if (linkUrl && !isHttpUrl(linkUrl)) {
    sendError(res, "Banner link URL must be a valid http(s) URL", 400);
    return;
  }

  if (audience === "user") {
    const totalUserBanners = await Banner.countDocuments({
      audience: "user",
      isDeleted: { $ne: true },
    });
    if (totalUserBanners >= MAX_USER_BANNERS) {
      sendError(res, `Only ${MAX_USER_BANNERS} user banners are allowed`, 400);
      return;
    }
  }

  const banner = await Banner.create({
    title,
    imageUrl,
    linkUrl: linkUrl || undefined,
    audience,
    status: normalizeBannerStatus(body),
    sortOrder:
      typeof body.sortOrder === "number"
        ? body.sortOrder
        : Number(body.sortOrder || 0),
    createdBy: new mongoose.Types.ObjectId(req.user!.id),
    updatedBy: new mongoose.Types.ObjectId(req.user!.id),
  });

  sendSuccess(res, "Banner created", { banner }, 201);
}

export async function updateBanner(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {
    updatedBy: new mongoose.Types.ObjectId(req.user!.id),
  };

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      sendError(res, "Banner title cannot be empty", 400);
      return;
    }
    update.title = title;
  }

  if (
    body.status !== undefined ||
    body.isActive !== undefined ||
    body.active !== undefined
  ) {
    const status = normalizeBannerStatus(body);
    update.status = status;
    update.isActive = status === "active";
  }

  if (
    body.imageUrl !== undefined ||
    body.bannerUrl !== undefined ||
    body.image !== undefined ||
    body.url !== undefined
  ) {
    const imageUrl = normalizeBannerUrl(
      body.imageUrl || body.bannerUrl || body.image || body.url,
    );
    if (!imageUrl || !isHttpUrl(imageUrl)) {
      sendError(res, "A valid banner image URL is required", 400);
      return;
    }
    if (!isCloudinaryUrl(imageUrl)) {
      sendError(res, "Banner image must be a Cloudinary URL", 400);
      return;
    }
    update.imageUrl = imageUrl;
  }

  if (
    body.linkUrl !== undefined ||
    body.redirectUrl !== undefined ||
    body.targetUrl !== undefined
  ) {
    const linkUrl = normalizeBannerUrl(
      body.linkUrl || body.redirectUrl || body.targetUrl,
    );
    if (linkUrl && !isHttpUrl(linkUrl)) {
      sendError(res, "Banner link URL must be a valid http(s) URL", 400);
      return;
    }
    update.linkUrl = linkUrl || undefined;
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      sendError(res, "sortOrder must be a non-negative number", 400);
      return;
    }
    update.sortOrder = sortOrder;
  }

  const banner = await Banner.findOneAndUpdate(
    { _id: req.params.id, isDeleted: { $ne: true } },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!banner) {
    sendNotFound(res, "Banner not found");
    return;
  }

  sendSuccess(res, "Banner updated", { banner });
}

export async function deleteBanner(req: Request, res: Response): Promise<void> {
  const banner = await Banner.findOneAndUpdate(
    { _id: req.params.id, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        isActive: false,
        status: "inactive",
        deletedAt: new Date(),
        deletedBy: new mongoose.Types.ObjectId(req.user!.id),
        updatedBy: new mongoose.Types.ObjectId(req.user!.id),
      },
    },
    { new: true },
  ).lean();

  if (!banner) {
    sendNotFound(res, "Banner not found");
    return;
  }

  sendSuccess(res, "Banner deleted", { banner });
}

export async function getRechargeRequests(
  req: Request,
  res: Response,
): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const status = (req.query.status as string) || "pending";
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const [requests, total] = await Promise.all([
    RechargeRequest.find(filter)
      .populate("driverId", "phone name accountStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RechargeRequest.countDocuments(filter),
  ]);

  sendSuccess(res, "Recharge requests fetched", { requests }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getDrivers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;
  const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (status) {
    filter.$or = [{ accountStatus: status }, { kycStatus: status }];
  }

  const [drivers, total] = await Promise.all([
    Driver.find(filter)
      .select(
        "phone countryCode name email dob gender vehicleType vehicleModel vehicleNumber vehicleColor vehicleYear serviceArea accountStatus kycStatus kycRejectionReason walletBalance totalEarnings rating totalRatings totalRides aadhaarNumber licenseNumber aadhaarDocument licenseDocument selfieDocument vehicleDocument licenseExpiry isUnionLeader referralCode referralCount isOnline isAvailable isActive isVerified createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    "Drivers fetched",
    {
      drivers: drivers.map(withKycDocuments),
    },
    200,
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
}

export async function getRiders(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [riders, total] = await Promise.all([
    User.find({ role: "rider", isDeleted: { $ne: true } })
      .select(
        "phone countryCode role name email avatar dob gender rating totalRatings totalRides walletBalance isActive isVerified createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments({ role: "rider", isDeleted: { $ne: true } }),
  ]);

  sendSuccess(res, "Riders fetched", { riders }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getUnionLeaders(
  req: Request,
  res: Response,
): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [leaders, total] = await Promise.all([
    Driver.find({ isUnionLeader: true, isDeleted: { $ne: true } })
      .select(
        "phone countryCode name email vehicleType vehicleModel vehicleNumber accountStatus kycStatus walletBalance totalEarnings rating totalRatings totalRides isUnionLeader referralCode referralCount isActive isVerified createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments({ isUnionLeader: true, isDeleted: { $ne: true } }),
  ]);

  sendSuccess(res, "Union leaders fetched", { leaders }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getRides(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const { status, vehicleType } = req.query;
  const filter: Record<string, unknown> = {};

  if (typeof status === "string" && status.trim()) {
    filter.status = status.trim();
  }
  if (typeof vehicleType === "string" && vehicleType.trim()) {
    filter.vehicleType = vehicleType.trim();
  }

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate("riderId", "name phone")
      .populate("driverId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Ride.countDocuments(filter),
  ]);

  sendSuccess(res, "Rides fetched", { rides }, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getBasePrices(
  _req: Request,
  res: Response,
): Promise<void> {
  await ensureDefaultBasePrices();
  const basePrices = await BasePrice.find().sort({ vehicleType: 1 }).lean();

  sendSuccess(res, "Base prices fetched", { basePrices });
}

export async function createBasePrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { vehicleType, basePrice, pricePerKm, minimumFare, isActive } =
    req.body;

  if (!isVehicleType(vehicleType)) {
    sendError(res, "Invalid vehicle type", 400);
    return;
  }

  const price = await BasePrice.findOneAndUpdate(
    { vehicleType },
    {
      $set: {
        basePrice,
        pricePerKm,
        minimumFare,
        isActive: isActive === undefined ? true : isActive,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  sendSuccess(res, "Base price saved", { basePrice: price }, 201);
}

export async function updateBasePrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const update: Record<string, unknown> = {};

  ["basePrice", "pricePerKm", "minimumFare", "isActive"].forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  if (isVehicleType(req.body.vehicleType)) {
    update.vehicleType = req.body.vehicleType;
  }

  const price = await BasePrice.findOneAndUpdate(
    mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { vehicleType: id },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!price) {
    sendNotFound(res, "Base price not found");
    return;
  }

  sendSuccess(res, "Base price updated", { basePrice: price });
}

export async function deleteBasePrice(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const price = await BasePrice.findOneAndDelete(
    mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { vehicleType: id },
  ).lean();

  if (!price) {
    sendNotFound(res, "Base price not found");
    return;
  }

  sendSuccess(res, "Base price deleted", { basePrice: price });
}

export async function getPendingDrivers(
  req: Request,
  res: Response,
): Promise<void> {
  const { page, limit, skip } = getPagination(req);

  const [drivers, total] = await Promise.all([
    Driver.find({
      isDeleted: { $ne: true },
      $or: [{ accountStatus: "pending" }, { kycStatus: "pending" }],
    })
      .select(
        "phone countryCode name email dob gender vehicleType vehicleModel vehicleNumber vehicleColor vehicleYear serviceArea accountStatus kycStatus kycRejectionReason walletBalance aadhaarNumber licenseNumber aadhaarDocument licenseDocument selfieDocument vehicleDocument licenseExpiry createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments({
      isDeleted: { $ne: true },
      $or: [{ accountStatus: "pending" }, { kycStatus: "pending" }],
    }),
  ]);

  sendSuccess(
    res,
    "Pending driver approvals fetched",
    {
      drivers: drivers.map(withKycDocuments),
    },
    200,
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
}

export async function getDriverKycDetails(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.params.id)
    .select(
      "phone countryCode name email dob gender vehicleType vehicleModel vehicleNumber vehicleColor vehicleYear serviceArea accountStatus kycStatus kycRejectionReason walletBalance aadhaarNumber licenseNumber aadhaarDocument licenseDocument selfieDocument vehicleDocument licenseExpiry createdAt updatedAt",
    )
    .lean();
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  sendSuccess(res, "Driver KYC details fetched", {
    driver: withKycDetails(driver),
  });
}

function resolveBanState(body: Record<string, unknown>): {
  isBanned: boolean;
  accountStatus: "active" | "banned";
  reason?: string;
} {
  const action = typeof body.action === "string" ? body.action : undefined;
  const banned =
    action === "ban" ||
    body.banned === true ||
    body.isBanned === true ||
    body.blocked === true ||
    body.accountStatus === "banned" ||
    body.status === "banned";

  return {
    isBanned: Boolean(banned),
    accountStatus: banned ? "banned" : "active",
    reason:
      typeof body.reason === "string"
        ? body.reason
        : typeof body.rejectionReason === "string"
          ? body.rejectionReason
          : undefined,
  };
}

export async function updateDriverAccount(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  const update = resolveBanState(req.body as Record<string, unknown>);
  driver.isBanned = update.isBanned;
  driver.accountStatus = update.accountStatus;
  driver.isActive = update.accountStatus !== "banned";
  if (update.reason) {
    driver.kycRejectionReason = update.reason;
  }
  await driver.save();

  sendSuccess(res, "Driver account updated", { user: driver });
}

export async function updateRiderAccount(
  req: Request,
  res: Response,
): Promise<void> {
  const rider = await User.findById(req.params.id);
  if (!rider) {
    sendNotFound(res, "Rider not found");
    return;
  }

  const update = resolveBanState(req.body as Record<string, unknown>);
  rider.isBanned = update.isBanned;
  rider.accountStatus = update.accountStatus;
  rider.isActive = update.accountStatus !== "banned";
  await rider.save();

  sendSuccess(res, "Rider account updated", { user: rider });
}

export async function deleteDriverAccount(
  req: Request,
  res: Response,
): Promise<void> {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  driver.isDeleted = true;
  driver.deletedAt = new Date();
  driver.deletedBy = new mongoose.Types.ObjectId(req.user!.id);
  driver.isActive = false;
  driver.accountStatus = "banned";
  await driver.save();

  sendSuccess(res, "Driver account deleted", { user: driver });
}

export async function deleteRiderAccount(
  req: Request,
  res: Response,
): Promise<void> {
  const rider = await User.findById(req.params.id);
  if (!rider) {
    sendNotFound(res, "Rider not found");
    return;
  }

  rider.isDeleted = true;
  rider.deletedAt = new Date();
  rider.deletedBy = new mongoose.Types.ObjectId(req.user!.id);
  rider.isActive = false;
  rider.accountStatus = "banned";
  await rider.save();

  sendSuccess(res, "Rider account deleted", { user: rider });
}

export async function verifyDriver(req: Request, res: Response): Promise<void> {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "pending" && driver.kycStatus !== "pending") {
    sendError(res, "Only pending drivers can be verified", 400);
    return;
  }

  const balanceBefore = driver.walletBalance;
  driver.accountStatus = "verified";
  driver.kycStatus = "approved";
  driver.kycRejectionReason = undefined;
  driver.isVerified = true;
  driver.isActive = true;

  // Credit the full 3000 sign-up bonus on admin approval.
  // The driver starts with 0 balance after the Google Sign-In flow,
  // so the full bonus is always added here.
  const bonusCredit = env.DRIVER_VERIFICATION_BONUS;
  driver.walletBalance += bonusCredit;
  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount: bonusCredit,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Driver verified by admin — ₹${bonusCredit} sign-up bonus credited`,
    status: "completed",
  });

  sendSuccess(res, "Driver approved and ₹" + bonusCredit + " bonus credited", {
    driverId: driver._id,
    walletBalance: driver.walletBalance,
    accountStatus: driver.accountStatus,
    kycStatus: driver.kycStatus,
  });
}

export async function rejectDriver(req: Request, res: Response): Promise<void> {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }
  if (driver.accountStatus !== "pending" && driver.kycStatus !== "pending") {
    sendError(res, "Only pending drivers can be rejected", 400);
    return;
  }

  driver.accountStatus = "rejected";
  driver.kycStatus = "rejected";
  driver.kycRejectionReason =
    (req.body?.reason as string) ||
    (req.body?.rejectionReason as string) ||
    "KYC rejected by admin";
  driver.isVerified = false;
  await driver.save();

  sendSuccess(res, "Driver verification rejected", {
    driverId: driver._id,
    accountStatus: driver.accountStatus,
    kycStatus: driver.kycStatus,
    rejectionReason: driver.kycRejectionReason,
  });
}

export async function adjustDriverWallet(
  req: Request,
  res: Response,
): Promise<void> {
  const driverId = req.params.id;
  const { action, amount, description } = req.body as {
    action: "credit" | "debit" | "set";
    amount: number;
    description?: string;
  };

  const driver = await Driver.findById(driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  if (!action || typeof amount !== "number" || amount < 0) {
    sendError(res, "Invalid wallet adjustment payload", 400);
    return;
  }

  const balanceBefore = driver.walletBalance;
  let transactionAmount = 0;
  if (action === "credit") {
    driver.walletBalance += amount;
    transactionAmount = amount;
  } else if (action === "debit") {
    const deduction = Math.min(driver.walletBalance, amount);
    driver.walletBalance -= deduction;
    transactionAmount = -deduction;
  } else {
    driver.walletBalance = amount;
    transactionAmount = amount - balanceBefore;
  }

  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: transactionAmount >= 0 ? "wallet_recharge" : "withdrawal",
    amount: transactionAmount,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description:
      description ||
      `Admin wallet adjustment (${action}) for driver ${driver.phone}`,
    status: "completed",
  });

  sendSuccess(res, "Driver wallet updated", {
    driverId: driver._id,
    walletBalance: driver.walletBalance,
  });
}

export async function approveRechargeRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = req.params.id;
  const rechargeRequest = await RechargeRequest.findOneAndUpdate(
    { _id: requestId, status: "pending" },
    {
      $set: {
        status: "approved",
        reviewedBy: new mongoose.Types.ObjectId(req.user!.id),
        approvedBy: new mongoose.Types.ObjectId(req.user!.id),
        reviewedAt: new Date(),
        approvedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!rechargeRequest) {
    const existing = await RechargeRequest.findById(requestId).lean();
    if (!existing) sendNotFound(res, "Recharge request not found");
    else sendError(res, "Only pending requests can be approved", 400);
    return;
  }

  const driver = await Driver.findById(rechargeRequest.driverId);
  if (!driver) {
    sendNotFound(res, "Driver not found");
    return;
  }

  const balanceBefore = driver.walletBalance;
  driver.walletBalance += rechargeRequest.amount;
  await driver.save();

  await Transaction.create({
    userId: driver._id,
    userModel: "Driver",
    type: "wallet_recharge",
    amount: rechargeRequest.amount,
    balanceBefore,
    balanceAfter: driver.walletBalance,
    description: `Admin approved wallet recharge request for ₹${rechargeRequest.amount}`,
    status: "completed",
    reference: rechargeRequest.paymentReference,
  });

  sendSuccess(res, "Recharge request approved", {
    requestId: rechargeRequest._id,
    walletBalance: driver.walletBalance,
  });
}

export async function rejectRechargeRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = req.params.id;
  const rechargeRequest = await RechargeRequest.findById(requestId);
  if (!rechargeRequest) {
    sendNotFound(res, "Recharge request not found");
    return;
  }

  if (rechargeRequest.status !== "pending") {
    sendError(res, "Only pending requests can be rejected", 400);
    return;
  }

  rechargeRequest.status = "rejected";
  rechargeRequest.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
  rechargeRequest.rejectedBy = new mongoose.Types.ObjectId(req.user!.id);
  rechargeRequest.reviewedAt = new Date();
  rechargeRequest.rejectedAt = new Date();
  rechargeRequest.rejectionReason =
    (req.body?.reason as string) ||
    (req.body?.rejectionReason as string) ||
    "Recharge request rejected by admin";
  await rechargeRequest.save();

  sendSuccess(res, "Recharge request rejected", {
    requestId: rechargeRequest._id,
    status: rechargeRequest.status,
    rejectionReason: rechargeRequest.rejectionReason,
  });
}
