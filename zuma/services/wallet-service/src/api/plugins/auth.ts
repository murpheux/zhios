// Moved to @zuma/shared-http; kept as a re-export so routes can keep importing `toActor` from here.
export { authPlugin as default, toActor } from '@zuma/shared-http';
export type { AuthPluginOptions, JwtPayload } from '@zuma/shared-http';
