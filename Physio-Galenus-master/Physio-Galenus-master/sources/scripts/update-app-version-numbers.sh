#!/usr/bin/env bash

if [ -z "$VERSION" ]; then echo "Error: VERSION (e.g. VERSION=1.0.0) environment variable is required"; exit 1; fi

m_sed() {
  if ! command -v gsed &> /dev/null; then
    sed "$@"
  else
    gsed "$@"
  fi
}

versionStr="${VERSION}+build$(date "+%Y%m%dT%H%M%S.%3N")"
echo "Updating application version numbers to $versionStr"

jq ".version=\"$versionStr\"" sources/backend/package.json > sources/backend/package.json.tmp && mv sources/backend/package.json.tmp sources/backend/package.json
jq ".version=\"$versionStr\"" sources/backend/package-lock.json > sources/backend/package-lock.json.tmp && mv sources/backend/package-lock.json.tmp sources/backend/package-lock.json
jq ".version=\"$versionStr\"" sources/backend/package.production.json > sources/backend/package.production.json.tmp && mv sources/backend/package.production.json.tmp sources/backend/package.production.json
jq ".version=\"$versionStr\"" sources/frontend/package.json > sources/frontend/package.json.tmp && mv sources/frontend/package.json.tmp sources/frontend/package.json
jq ".version=\"$versionStr\"" sources/frontend/package-lock.json > sources/frontend/package-lock.json.tmp && mv sources/frontend/package-lock.json.tmp sources/frontend/package-lock.json
m_sed -i "s/\s*version:.*,/  version: '$versionStr',/" sources/backend/src/config/app.config.ts