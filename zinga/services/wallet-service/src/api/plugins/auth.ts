// Moved to @zinga/shared-http; kept as a re-export so routes can keep importing `toActor` from here.
export { authPlugin as default, toActor } from '@zinga/shared-http';
export type { AuthPluginOptions, JwtPayload } from '@zinga/shared-http';
