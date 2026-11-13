/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZUMA_GATEWAY_URL: string;
  readonly VITE_OIDC_AUTHORITY: string;
  readonly VITE_OIDC_CLIENT_ID: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
  readonly VITE_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
  readonly VITE_OIDC_SCOPE?: string;
  readonly VITE_OIDC_AUDIENCE?: string;
  readonly VITE_NEWRELIC_ENABLED?: string;
  readonly VITE_NEWRELIC_LICENSE_KEY?: string;
  readonly VITE_NEWRELIC_APP_ID?: string;
  readonly VITE_NEWRELIC_ACCOUNT_ID?: string;
  readonly VITE_NEWRELIC_AGENT_ID?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
