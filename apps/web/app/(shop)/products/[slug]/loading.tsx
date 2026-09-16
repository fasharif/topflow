import { Container, Skeleton } from '@/components/ui';

export default function ProductLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <p role="status" className="sr-only">
        Loading the product…
      </p>
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-10 w-4/5" />
          <Skeleton className="mt-4 h-6 w-32 rounded-full" />
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-8 w-56" />
            <Skeleton className="mt-6 h-10 w-36" />
            <div className="mt-5 flex gap-3">
              <Skeleton className="h-12 flex-1 rounded-full" />
              <Skeleton className="h-12 flex-1 rounded-full" />
            </div>
          </div>
          <Skeleton className="mt-8 h-24 w-full" />
        </div>
      </div>
    </Container>
  );
}
