#!/usr/bin/env bash
# Converts the walkthrough video recorded by `npm run screenshots` (reports/walkthrough/
# walkthrough.webm) into docs/screenshots/walkthrough.gif with ffmpeg in the pinned container:
# 8 frames per second, 800 pixels wide, with a palette generated from the video itself.
set -euo pipefail
# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

if [[ ! -f "$TESTS_DIR/reports/walkthrough/walkthrough.webm" ]]; then
  echo "No walkthrough video yet: run npm run screenshots -w @topflow/system-tests first." >&2
  exit 1
fi

compose run --rm --no-deps ffmpeg -hide_banner -loglevel error -y \
  -i /reports/walkthrough/walkthrough.webm \
  -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
  /reports/walkthrough/walkthrough.gif

mkdir -p "$REPO_DIR/docs/screenshots"
cp "$TESTS_DIR/reports/walkthrough/walkthrough.gif" "$REPO_DIR/docs/screenshots/walkthrough.gif"
echo "Wrote docs/screenshots/walkthrough.gif ($(wc -c < "$REPO_DIR/docs/screenshots/walkthrough.gif") bytes)"
