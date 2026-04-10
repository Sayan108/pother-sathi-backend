import { MongoMemoryServer } from 'mongodb-memory-server';

module.exports = async () => {
  const mongod: MongoMemoryServer | null = (global as any).__MONGOD__;
  if (mongod) {
    await mongod.stop();
  }
  // Docker MongoDB is stopped separately (managed outside Jest)
};
