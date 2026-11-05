#!/usr/bin/env bash
set -Eeuo pipefail

validate_target() {
  local app_dir=$1 domain=$2
  [[ "$app_dir" =~ ^/srv/[A-Za-z0-9._/-]+$ ]] || { printf 'Unexpected application directory\n' >&2; exit 2; }
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || { printf 'Unexpected domain\n' >&2; exit 2; }
}

acquire_lock() {
  [[ -d "$APP_DIR" ]] || { printf 'Application directory is missing\n' >&2; exit 1; }
  command -v flock >/dev/null || { printf 'flock is required for deployment locking\n' >&2; exit 1; }
  exec 9>"$APP_DIR/.deploy.lock"
  flock -n 9 || { printf 'Another deployment is already running\n' >&2; exit 1; }
}

smoke() {
  curl --fail --silent --show-error --max-time 15 "https://$DOMAIN/login" >/dev/null
  curl --fail --silent --show-error --max-time 15 "https://$DOMAIN/manifest.json" | grep -Fq '"commit":"'$EXPECTED_REVISION'"'
}

rollback_current() {
  local current_target previous next
  current_target=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)
  previous=$(find "$APP_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk -v current="$current_target" '$2 != current { print $2; exit }')
  [[ -n "$previous" && -d "$previous" ]] || { printf 'No previous release available\n' >&2; return 1; }
  EXPECTED_REVISION=$(basename "$previous")
  next="$APP_DIR/.current-rollback-$$"
  rm -f "$next"
  ln -s "$previous" "$next"
  mv -Tf "$next" "$APP_DIR/current"
  if ! smoke; then
    [[ -n "$current_target" && -d "$current_target" ]] && { ln -sfn "$current_target" "$next"; mv -Tf "$next" "$APP_DIR/current"; }
    printf 'Rollback smoke-check failed; previous current symlink restored\n' >&2
    return 1
  fi
  printf 'rolled back to %s\n' "$(basename "$previous")"
}

if [[ "${1:-}" == '--rollback' ]]; then
  [[ $# -eq 3 ]] || { printf 'Usage: %s --rollback APP_DIR DOMAIN\n' "$0" >&2; exit 2; }
  APP_DIR=$2
  DOMAIN=$3
  validate_target "$APP_DIR" "$DOMAIN"
  acquire_lock
  EXPECTED_REVISION=$(readlink -f "$APP_DIR/current" 2>/dev/null | sed 's#^.*/##')
  rollback_current
  exit 0
fi

[[ $# -eq 5 ]] || { printf 'Usage: %s BUNDLE REVISION BUNDLE_SHA APP_DIR DOMAIN\n' "$0" >&2; exit 2; }
BUNDLE_PATH=$1
EXPECTED_REVISION=$2
EXPECTED_BUNDLE_SHA=$3
APP_DIR=$4
DOMAIN=$5
validate_target "$APP_DIR" "$DOMAIN"
acquire_lock
[[ "$EXPECTED_REVISION" =~ ^[0-9a-f]{40}$ ]] || { printf 'Invalid revision\n' >&2; exit 2; }
[[ "$EXPECTED_BUNDLE_SHA" =~ ^[0-9a-f]{64}$ ]] || { printf 'Invalid bundle checksum\n' >&2; exit 2; }
[[ -s "$BUNDLE_PATH" ]] || { printf 'Bundle is missing\n' >&2; exit 1; }

if [[ "$(sha256sum "$BUNDLE_PATH" | awk '{print $1}')" != "$EXPECTED_BUNDLE_SHA" ]]; then
  printf 'Bundle checksum mismatch\n' >&2
  exit 1
fi

NGINX_CONFIG="/etc/nginx/sites-enabled/$DOMAIN"
[[ -e "$NGINX_CONFIG" ]] || { printf 'Expected Nginx config is missing; refusing deployment\n' >&2; exit 1; }
grep -Fq "root $APP_DIR/current;" "$NGINX_CONFIG" || { printf 'Nginx root does not match the configured application directory; refusing deployment\n' >&2; exit 1; }
if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then sudo -n nginx -t; else nginx -t; fi

STAGING_DIR=$(mktemp -d)
RELEASE_DIR="$APP_DIR/releases/$EXPECTED_REVISION"
CURRENT_LINK="$APP_DIR/current"
NEXT_LINK="$APP_DIR/.current-$EXPECTED_REVISION"
PREVIOUS_RELEASE=$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)
SWITCHED=0

cleanup() { rm -rf "$STAGING_DIR"; }
rollback_on_error() {
  local exit_code=$?
  trap - EXIT ERR
  set +e
  if [[ "$SWITCHED" == '1' && -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    rm -f "$NEXT_LINK"
    ln -s "$PREVIOUS_RELEASE" "$NEXT_LINK"
    mv -Tf "$NEXT_LINK" "$CURRENT_LINK"
  fi
  cleanup
  printf 'Deployment failed for %s\n' "$EXPECTED_REVISION" >&2
  exit "$exit_code"
}
trap cleanup EXIT
trap rollback_on_error ERR

install -d -m 0755 "$APP_DIR/releases"
[[ ! -e "$RELEASE_DIR" ]] || { printf 'Release already exists: %s\n' "$EXPECTED_REVISION" >&2; exit 1; }
tar -xzf "$BUNDLE_PATH" -C "$STAGING_DIR"
[[ -f "$STAGING_DIR/REVISION" && "$(<"$STAGING_DIR/REVISION")" == "$EXPECTED_REVISION" ]] || { printf 'Bundle revision mismatch\n' >&2; exit 1; }
[[ -f "$STAGING_DIR/DEPLOY_MANIFEST.sha256" ]] || { printf 'Bundle manifest is missing\n' >&2; exit 1; }
(cd "$STAGING_DIR" && sha256sum -c DEPLOY_MANIFEST.sha256 >/dev/null)
[[ -s "$STAGING_DIR/index.html" && -s "$STAGING_DIR/config.js" && -s "$STAGING_DIR/manifest.json" ]] || { printf 'Frontend bundle is incomplete\n' >&2; exit 1; }
grep -Fq '"commit":"'$EXPECTED_REVISION'"' "$STAGING_DIR/manifest.json"
cp -a "$STAGING_DIR" "$RELEASE_DIR"

rm -f "$NEXT_LINK"
ln -s "$RELEASE_DIR" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT_LINK"
SWITCHED=1
if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then sudo -n systemctl reload nginx; fi
smoke
cleanup
trap - EXIT ERR
printf 'revision=%s\n' "$EXPECTED_REVISION"
printf 'frontend=active\n'
printf 'nginx=checked\n'
