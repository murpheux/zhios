import type { Actor } from '../../src/application/actor';

export const OWNER_SUB = '00u-owner-okta-id';
export const OTHER_SUB = '00u-other-okta-id';

export const ownerActor: Actor = { sub: OWNER_SUB, isAdmin: false, token: 'owner-token' };
export const otherActor: Actor = { sub: OTHER_SUB, isAdmin: false, token: 'other-token' };
export const adminActor: Actor = { sub: '00u-admin', isAdmin: true, token: 'admin-token' };

export const validUser = {
  username: 'jane.doe',
  email: 'Jane.Doe@Example.com',
  identity: {
    displayName: 'Jane Doe',
  },
};
