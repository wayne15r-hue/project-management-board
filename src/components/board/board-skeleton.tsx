import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard() {
  return (
    <div className="mx-1.5 my-1 rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonColumn({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col rounded-lg border border-border bg-muted/40">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="flex-1 space-y-0 px-1">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background px-8 pt-6 pb-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-3.5 w-64" />
        <div className="mt-5 flex items-center gap-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
      {/* Board */}
      <div className="flex h-full gap-3 overflow-x-auto px-6 py-5">
        <SkeletonColumn cardCount={3} />
        <SkeletonColumn cardCount={4} />
        <SkeletonColumn cardCount={2} />
        <SkeletonColumn cardCount={3} />
      </div>
    </div>
  );
}
