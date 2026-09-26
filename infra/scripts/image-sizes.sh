#!/usr/bin/env bash
# Prints the sizes of the three images as the Markdown table in infra/README.md: the image size
# Docker reports, and the disk usage of the application files under /app. MB means 10^6 bytes.
#
#   infra/scripts/image-sizes.sh [PREFIX] [TAG]     images PREFIX-{api,web,migrate}:TAG
#                                                    (default topflow-hub-*:local, as Compose builds them)
#
# Also measures the Node.js base image named in apps/api/Dockerfile, pulling it if needed.
set -Eeuo pipefail
# Git Bash on Windows would otherwise rewrite /app into a Windows path.
export MSYS_NO_PATHCONV=1

prefix="${1:-topflow-hub}"
tag="${2:-local}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dockerfile="$here/../../apps/api/Dockerfile"

mb() { awk -v bytes="$1" 'BEGIN { printf "%.1f", bytes / 1000000 }'; }

image_size() { docker image inspect --format '{{.Size}}' "$1"; }

base="$(sed -n 's/^FROM \([^ ]*\) AS node-base$/\1/p' "$dockerfile")"
[[ -n "$base" ]] || { echo "image-sizes: no node-base stage in $dockerfile" >&2; exit 1; }

echo "| Image | Image size (MB) | Application files in /app (MB, disk usage) |"
echo "| --- | ---: | ---: |"
for app in api web migrate; do
  image="$prefix-$app:$tag"
  size="$(image_size "$image")" || { echo "image-sizes: $image not found; build it first" >&2; exit 1; }
  kib="$(docker run --rm --entrypoint du "$image" -sk /app | cut -f1)"
  echo "| \`topflow-hub-$app\` | $(mb "$size") | $(mb $((kib * 1024))) |"
done
docker image inspect "$base" >/dev/null 2>&1 || docker pull --quiet "$base" >/dev/null
echo "| base \`${base%@*}\`, for comparison | $(mb "$(image_size "$base")") | — |"
