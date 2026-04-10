import { MongoMemoryServer } from 'mongodb-memory-server';

module.exports = async () => {
  // Try to use Docker MongoDB (preferred in CI/sandboxed environments)
  // Fall back to MongoMemoryServer for environments with internet access
  const dockerUri = 'mongodb://localhost:27017/pothersathi_test';

  process.env.MONGODB_URI = dockerUri;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only-32chars';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.DEMO_MODE = 'true';
  process.env.DEMO_OTP = '123456';
  process.env.PORT = '0';
  process.env.PLATFORM_FEE_PERCENT = '15';

  (global as any).__MONGOD__ = null;
};

