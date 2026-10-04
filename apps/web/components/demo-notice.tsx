import { Alert, LinkButton } from '@/components/ui';

/** Replaces a form that the portfolio demo switches off, and points visitors to the demo accounts. */
export function DemoNotice({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
      <div className="mt-6">
        <Alert tone="info" title="Portfolio demo">
          {children}
        </Alert>
      </div>
      <LinkButton href="/login" size="lg" className="mt-6 w-full">
        Sign in with a demo account
      </LinkButton>
    </div>
  );
}
