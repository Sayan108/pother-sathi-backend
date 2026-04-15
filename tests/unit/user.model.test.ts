import { User } from '../../src/models/User';

describe('User model indexes', () => {
  it('should define only one email index', () => {
    const emailIndexes = User.schema
      .indexes()
      .filter(([fields]) => fields.email === 1);

    expect(emailIndexes).toHaveLength(1);
  });
});
