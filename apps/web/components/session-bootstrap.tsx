'use client';

import { useEffect } from 'react';
import { bootstrapSession } from '@/lib/session';

/** Restores the session from the httpOnly refresh cookie once per page load. */
export function SessionBootstrap() {
  useEffect(() => {
    bootstrapSession();
  }, []);
  return null;
}
