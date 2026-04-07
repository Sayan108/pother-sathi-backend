import { Driver, VehicleType } from '../models/Driver';
import { env } from '../config/environment';
import { logger } from '../utils/logger';

type SeedDriver = {
  phone: string;
  name: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  vehicleNumber: string;
  vehicleColor: string;
  serviceArea: string;
  lat: number;
  lng: number;
};

const seedDrivers: SeedDriver[] = [
  {
    phone: '9000000001',
    name: 'Rahim Toto',
    vehicleType: 'toto',
    vehicleModel: 'Mahindra Treo',
    vehicleNumber: 'WB20AT1001',
    vehicleColor: 'Green',
    serviceArea: 'Maheshtala',
    lat: 22.5329,
    lng: 88.2898,
  },
  {
    phone: '9000000002',
    name: 'Kamal Toto',
    vehicleType: 'toto',
    vehicleModel: 'YC Electric Yatri',
    vehicleNumber: 'WB20AT1002',
    vehicleColor: 'Blue',
    serviceArea: 'Thakurpukur',
    lat: 22.5348,
    lng: 88.3005,
  },
  {
    phone: '9000000003',
    name: 'Sujon Auto',
    vehicleType: 'auto',
    vehicleModel: 'Bajaj RE',
    vehicleNumber: 'WB20AU1003',
    vehicleColor: 'Yellow',
    serviceArea: 'Behala',
    lat: 22.5207,
    lng: 88.3216,
  },
  {
    phone: '9000000004',
    name: 'Bappa Bike',
    vehicleType: 'bike',
    vehicleModel: 'Honda Shine',
    vehicleNumber: 'WB20BK1004',
    vehicleColor: 'Black',
    serviceArea: 'Park Circus',
    lat: 22.5389,
    lng: 88.3721,
  },
  {
    phone: '9000000005',
    name: 'Rakesh Car',
    vehicleType: 'car',
    vehicleModel: 'Maruti WagonR',
    vehicleNumber: 'WB20CR1005',
    vehicleColor: 'White',
    serviceArea: 'Science City',
    lat: 22.5401,
    lng: 88.3958,
  },
];

export async function seedDevelopmentDrivers(): Promise<void> {
  if (!env.DEV_SEED_ACTIVE_DRIVERS) {
    return;
  }

  let upserted = 0;
  for (const driver of seedDrivers) {
    const existingDriver = await Driver.findOneAndUpdate(
      { phone: driver.phone },
      {
        $set: {
          countryCode: '+91',
          name: driver.name,
          vehicleType: driver.vehicleType,
          vehicleModel: driver.vehicleModel,
          vehicleNumber: driver.vehicleNumber,
          vehicleColor: driver.vehicleColor,
          serviceArea: driver.serviceArea,
          location: {
            type: 'Point',
            coordinates: [driver.lng, driver.lat] as [number, number],
          },
          accountStatus: 'verified',
          isVerified: true,
          isActive: true,
          isOnline: true,
          isAvailable: true,
          walletBalance: Math.max(env.DRIVER_MIN_WALLET_BALANCE + 500, 1000),
        },
        $setOnInsert: {
          phone: driver.phone,
          rating: 5,
          totalRatings: 0,
          totalRides: 0,
          totalEarnings: 0,
        },
      },
      {
        upsert: true,
        new: false,
      }
    ).lean();

    if (!existingDriver) {
      upserted += 1;
    }
  }

  logger.info(`Development drivers ready: total=${seedDrivers.length}, newlyCreated=${upserted}`);
}
