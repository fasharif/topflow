/** Stricter per-IP limit for unauthenticated writes: credential endpoints and public forms. */
export const strictThrottle = {
  default: {
    limit: () => Number(process.env.AUTH_THROTTLE_LIMIT ?? 10),
    ttl: 60_000,
  },
};
