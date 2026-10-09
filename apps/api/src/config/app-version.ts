/**
 * The release number the API reports when APP_VERSION is unset (local runs, Vercel): at `GET /`,
 * `/health`, in the API docs and as the Sentry release. release-please sets it in each release
 * pull request; the container images set APP_VERSION instead.
 */
export const DEFAULT_APP_VERSION = '1.0.2'; // x-release-please-version
