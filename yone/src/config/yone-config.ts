import { z } from 'zod';

const E164 = /^\+[1-9]\d{6,14}$/;

// Optional "name -> webhook URL" JSON map. Hosts are pinned so a bad config value can't turn the
// gateway into an SSRF proxy; values are secrets (the URL is the credential) and come from 1Password.
const webhookTargets = (label: string, hostAllowed: (host: string) => boolean) =>
  z
    .string()
    .optional()
    .transform((raw, ctx): Record<string, string> => {
      if (raw === undefined || raw.trim() === '') return {};
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a JSON object` });
        return z.NEVER;
      }
      const result = z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), z.string().url()).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must map target names to URLs` });
        return z.NEVER;
      }
      for (const url of Object.values(result.data)) {
        const { protocol, hostname } = new URL(url);
        if (protocol !== 'https:' || !hostAllowed(hostname)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} contains a URL with a disallowed host` });
          return z.NEVER;
        }
      }
      return result.data;
    });

const hostEndsWith = (...suffixes: string[]) => (host: string) =>
  suffixes.some((s) => host === s.slice(1) || host.endsWith(s));

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = (schema: z.ZodString) => z.preprocess(blankToUndefined, schema.optional());

const flag = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true');

const csv = (defaultValue = '') =>
  z
    .string()
    .default(defaultValue)
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const yoneEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVICE_NAME: z.string().min(1).default('yone'),
    PORT: z.coerce.number().int().positive().default(3004),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    // HTTP hardening
    CORS_ALLOWED_ORIGINS: csv(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
    TRUST_PROXY: flag(false),
    HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(64 * 1024),
    HTTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

    /**
     * Comma-separated shared secrets accepted in the x-service-token header of /api/v1/notifications/*.
     * Empty means every call is rejected with 401; production requires at least one.
     */
    ALLOWED_SERVICE_TOKENS: csv().pipe(z.array(z.string().min(16, 'each token must be at least 16 characters'))),
    NOTIFICATION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),

    // Email: Twilio SendGrid
    SENDGRID_API_KEY: optionalString(z.string().min(1)),
    EMAIL_FROM_ADDRESS: optionalString(z.string().email()),
    EMAIL_FROM_NAME: optionalString(z.string().min(1)),

    // SMS: Twilio Programmable Messaging (set TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID)
    TWILIO_ACCOUNT_SID: optionalString(z.string().regex(/^AC[0-9a-f]{32}$/i)),
    TWILIO_AUTH_TOKEN: optionalString(z.string().min(1)),
    TWILIO_SMS_FROM: optionalString(z.string().regex(E164)),
    TWILIO_MESSAGING_SERVICE_SID: optionalString(z.string().regex(/^MG[0-9a-f]{32}$/i)),

    // Chat: JSON maps of target name -> incoming-webhook URL
    SLACK_WEBHOOK_URLS: webhookTargets('SLACK_WEBHOOK_URLS', hostEndsWith('.slack.com')),
    TEAMS_WEBHOOK_URLS: webhookTargets(
      'TEAMS_WEBHOOK_URLS',
      hostEndsWith('.webhook.office.com', '.logic.azure.com', '.api.powerplatform.com'),
    ),
  })
  .superRefine((env, ctx) => {
    const requireAll = (group: string, fields: Array<keyof typeof env>) => {
      const set = fields.filter((f) => env[f] !== undefined);
      if (set.length > 0 && set.length < fields.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [fields.find((f) => env[f] === undefined) as string],
          message: `${group} is partially configured; set ${fields.join(', ')} together`,
        });
      }
    };
    requireAll('email', ['SENDGRID_API_KEY', 'EMAIL_FROM_ADDRESS']);
    requireAll('sms credentials', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
    if (env.TWILIO_ACCOUNT_SID && !env.TWILIO_SMS_FROM && !env.TWILIO_MESSAGING_SERVICE_SID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TWILIO_SMS_FROM'],
        message: 'Set TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID',
      });
    }
    if (env.NODE_ENV === 'production' && env.ALLOWED_SERVICE_TOKENS.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ALLOWED_SERVICE_TOKENS'], message: 'must not be empty' });
    }
  });

export type YoneConfig = z.infer<typeof yoneEnvSchema>;

export const loadYoneConfig = (env: NodeJS.ProcessEnv = process.env): YoneConfig => {
  const result = yoneEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${issues.join('\n')}`);
  }
  return result.data;
};
