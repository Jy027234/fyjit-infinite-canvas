#!/bin/sh
set -e

# Executed automatically by the official nginx image entrypoint through /docker-entrypoint.d/*.sh before nginx starts.
# Generate runtime config.js from environment variables. Each analytics provider has an independent variable;
# unset providers remain disabled, load no scripts, and send no external requests. Multiple providers may be enabled together.

# GA4 and Baidu IDs contain only letters, numbers, and hyphens. Remove other characters
# so quotes and similar values cannot break the JavaScript strings in config.js as a defense-in-depth measure.
sanitize_id() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9-'
}

GA4_ID=$(sanitize_id "${ANALYTICS_GA4_ID:-}")
BAIDU_ID=$(sanitize_id "${ANALYTICS_BAIDU_ID:-}")
CREATIVE_API_BASE=${CREATIVE_API_BASE:-/api/creative}
FYJIT_HOME_URL=${FYJIT_HOME_URL:-/}
SOURCE_COMMIT=${SOURCE_COMMIT:-unknown}
SOURCE_URL=${SOURCE_URL:-}

escape_js() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/</\\u003c/g; s/>/\\u003e/g'
}

cat > /usr/share/nginx/html/creative/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  ANALYTICS_GA4_ID: "${GA4_ID}",
  ANALYTICS_BAIDU_ID: "${BAIDU_ID}",
  CREATIVE_API_BASE: "$(escape_js "$CREATIVE_API_BASE")",
  FYJIT_HOME_URL: "$(escape_js "$FYJIT_HOME_URL")",
  SOURCE_COMMIT: "$(escape_js "$SOURCE_COMMIT")",
  SOURCE_URL: "$(escape_js "$SOURCE_URL")"
};
EOF
