#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CONFIG_FILE="$ROOT_DIR/deploy/.env"
if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  . "$CONFIG_FILE"
  set +a
else
  printf 'Missing deploy/.env. Copy deploy/.env.example and set the server values.\n' >&2
  exit 1
fi

usage() { printf 'Usage: %s --main | --rollback\n' "$0"; }
[[ $# -eq 1 ]] || { usage >&2; exit 2; }
[[ "$1" == '--main' || "$1" == '--rollback' ]] || { usage >&2; exit 2; }
: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_KEY:?DEPLOY_KEY is required}"
: "${DEPLOY_DOMAIN:?DEPLOY_DOMAIN is required}"
: "${DEPLOY_APP_DIR:?DEPLOY_APP_DIR is required}"
[[ "$DEPLOY_HOST" != replace-* ]] || { printf 'Set the real deploy host in deploy/.env\n' >&2; exit 1; }
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] || { printf 'Set a numeric SSH port in deploy/.env\n' >&2; exit 1; }
[[ "$DEPLOY_DOMAIN" =~ ^[A-Za-z0-9.-]+$ && "$DEPLOY_DOMAIN" != replace-* ]] || { printf 'Set a valid deploy domain in deploy/.env\n' >&2; exit 1; }
[[ "$DEPLOY_APP_DIR" =~ ^/srv/[A-Za-z0-9._/-]+$ && "$DEPLOY_APP_DIR" != /srv/your-app ]] || { printf 'Set a valid deploy application directory in deploy/.env\n' >&2; exit 1; }
[[ -r "$DEPLOY_KEY" ]] || { printf 'SSH key is not readable: %s\n' "$DEPLOY_KEY" >&2; exit 1; }
for command_name in ssh scp curl; do command -v "$command_name" >/dev/null || { printf '%s is required\n' "$command_name" >&2; exit 1; }; done
SSH_OPTIONS=(-i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$DEPLOY_PORT")
SCP_OPTIONS=(-i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -P "$DEPLOY_PORT")
REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
REMOTE_SCRIPT="/tmp/crm-deploy-$$.sh"

if [[ "$1" == '--rollback' ]]; then
  scp "${SCP_OPTIONS[@]}" "$ROOT_DIR/deploy/remote_deploy.sh" "$REMOTE:$REMOTE_SCRIPT"
  ssh "${SSH_OPTIONS[@]}" "$REMOTE" bash "$REMOTE_SCRIPT" --rollback "$DEPLOY_APP_DIR" "$DEPLOY_DOMAIN"
  ssh "${SSH_OPTIONS[@]}" "$REMOTE" rm -f "$REMOTE_SCRIPT" >/dev/null 2>&1 || true
  curl --fail --silent --show-error --max-time 20 "https://$DEPLOY_DOMAIN/login" >/dev/null
  printf 'Frontend rollback completed\n'
  exit 0
fi

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY is required}"
for command_name in git gh npm; do command -v "$command_name" >/dev/null || { printf '%s is required\n' "$command_name" >&2; exit 1; }; done

BRANCH=$(git -C "$ROOT_DIR" branch --show-current)
[[ "$BRANCH" == 'main' ]] || { printf 'Deploy requires the main branch\n' >&2; exit 1; }
git -C "$ROOT_DIR" fetch origin main --prune
[[ -z "$(git -C "$ROOT_DIR" status --porcelain)" ]] || { printf 'Working tree must be clean before deploy\n' >&2; exit 1; }
REVISION=$(git -C "$ROOT_DIR" rev-parse --verify HEAD)
ORIGIN_REVISION=$(git -C "$ROOT_DIR" rev-parse --verify origin/main)
[[ "$REVISION" == "$ORIGIN_REVISION" ]] || { printf 'HEAD does not match the current origin/main\n' >&2; exit 1; }
REMOTE_BUNDLE="/tmp/crm-$REVISION.tar.gz"
REMOTE_SCRIPT="/tmp/crm-deploy-$REVISION.sh"
TEMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TEMP_DIR"; ssh "${SSH_OPTIONS[@]}" "$REMOTE" rm -f "$REMOTE_BUNDLE" "$REMOTE_SCRIPT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

check_ci() {
  local repo run_id run_sha run_status run_conclusion job_summary required_name line
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
  run_id=''
  run_sha=''
  run_status=''
  run_conclusion=''
  while IFS=$'\t' read -r candidate_id candidate_sha candidate_status candidate_conclusion; do
    if [[ "$candidate_sha" == "$REVISION" && "$candidate_status" == 'completed' && "$candidate_conclusion" == 'success' ]]; then
      run_id=$candidate_id
      run_sha=$candidate_sha
      run_status=$candidate_status
      run_conclusion=$candidate_conclusion
      break
    fi
  done < <(gh run list --repo "$repo" --workflow ci.yml --commit "$REVISION" --limit 50 --json databaseId,headSha,status,conclusion --jq '.[] | [.databaseId,.headSha,.status,(.conclusion // "")] | @tsv')
  [[ "$run_id" =~ ^[0-9]+$ && "$run_sha" == "$REVISION" && "$run_status" == 'completed' && "$run_conclusion" == 'success' ]] || { printf 'Latest CI run is not successful for this exact SHA\n' >&2; exit 1; }
  job_summary=$(gh run view "$run_id" --repo "$repo" --json jobs --jq '.jobs[] | [.name,.status,.conclusion] | @tsv')
  while IFS= read -r required_name; do
    line=$(printf '%s\n' "$job_summary" | awk -F '\t' -v name="$required_name" '$1 == name { print; exit }')
    [[ "$line" == "$required_name"$'\tcompleted\tsuccess' ]] || { printf 'Required CI job is not green: %s\n' "$required_name" >&2; exit 1; }
  done <<'EOF'
Code quality and build
PostgreSQL, API security and browser E2E
Verified artifact gate
EOF
  printf 'CI passed for %s\n' "$REVISION"
}

check_ci

printf 'Building the exact CI-verified main revision locally\n'
npm --prefix "$ROOT_DIR" ci
npm --prefix "$ROOT_DIR" run build
printf '%s\n' "$REVISION" > "$ROOT_DIR/dist/REVISION"
printf 'window.__APP_CONFIG__ = %s;\n' "$(printf '{\"supabaseUrl\":\"%s\",\"supabasePublishableKey\":\"%s\",\"appEnv\":\"cloud\"}' "$SUPABASE_URL" "$SUPABASE_PUBLISHABLE_KEY")" > "$ROOT_DIR/dist/config.js"
printf '{"commit":"%s"}\n' "$REVISION" > "$ROOT_DIR/dist/manifest.json"
(cd "$ROOT_DIR/dist" && find . -type f ! -name DEPLOY_MANIFEST.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > DEPLOY_MANIFEST.sha256)
tar -C "$ROOT_DIR/dist" -czf "$TEMP_DIR/bundle.tar.gz" .
BUNDLE_SHA=$(shasum -a 256 "$TEMP_DIR/bundle.tar.gz" | awk '{print $1}')

scp "${SCP_OPTIONS[@]}" "$ROOT_DIR/deploy/remote_deploy.sh" "$REMOTE:$REMOTE_SCRIPT"
scp "${SCP_OPTIONS[@]}" "$TEMP_DIR/bundle.tar.gz" "$REMOTE:$REMOTE_BUNDLE"
ssh "${SSH_OPTIONS[@]}" "$REMOTE" bash "$REMOTE_SCRIPT" "$REMOTE_BUNDLE" "$REVISION" "$BUNDLE_SHA" "$DEPLOY_APP_DIR" "$DEPLOY_DOMAIN"
curl --fail --silent --show-error --max-time 20 "https://$DEPLOY_DOMAIN/login" >/dev/null
curl --fail --silent --show-error --max-time 20 "https://$DEPLOY_DOMAIN/manifest.json" | grep -Fq '"commit":"'$REVISION'"'
printf 'Deployed %s to https://%s\n' "$REVISION" "$DEPLOY_DOMAIN"
