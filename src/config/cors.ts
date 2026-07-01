import { CorsOptions } from "cors";

export const isOriginAllowed = (origin?: string): boolean => {
  return true;
};

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 204,
};

export const socketCorsOptions = {
  origin: isOriginAllowed,
  methods: ["GET", "POST"],
  credentials: true,
};
