# Included from every location that sets add_header (nginx drops inherited add_header
# directives as soon as a location defines its own). Rendered by envsubst at container start:
#   ZUMA_GATEWAY_ORIGIN    e.g. https://api.wallet.example.com   (origin only, no path)
#   OIDC_AUTHORITY_ORIGIN  e.g. https://idp.example.com          (token, userinfo, JWKS calls)
# Both may be empty for a local smoke test; the SPA then cannot reach the API/IdP.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${ZUMA_GATEWAY_ORIGIN} ${OIDC_AUTHORITY_ORIGIN} https://bam.nr-data.net; frame-src ${OIDC_AUTHORITY_ORIGIN}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' ${OIDC_AUTHORITY_ORIGIN}; object-src 'none'" always;
# Only honoured by browsers over HTTPS — effective once TLS is terminated in front of this
# container (Ingress / Traefik), ignored on plain-HTTP local runs.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
