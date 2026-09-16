import { Container, Skeleton } from '@/components/ui';

export default function CatalogueLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <p role="status" className="sr-only">
        Loading the catalogue…
      </p>
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
        <div className="min-w-0">
          <Skeleton className="h-10 w-full" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="mt-4 h-3 w-24" />
                <Skeleton className="mt-2 h-5 w-4/5" />
                <Skeleton className="mt-6 h-6 w-1/2" />
                <Skeleton className="mt-4 h-10 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
