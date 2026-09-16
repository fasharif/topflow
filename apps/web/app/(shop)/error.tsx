'use client';

import { House, RotateCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { ContactOptions } from '@/components/contact-options';
import { Button, Container, LinkButton } from '@/components/ui';

export default function ShopError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning-50 text-warning-700">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="heading-2 mt-6">Something went wrong</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          This page couldn’t be loaded. Please try again. If the problem continues, our sales team can help by phone, WhatsApp or email.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-slate-500">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => retry()}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
          <LinkButton href="/" variant="secondary">
            <House aria-hidden="true" />
            Home page
          </LinkButton>
        </div>
        <ContactOptions className="mt-10 justify-center" />
      </div>
    </Container>
  );
}
