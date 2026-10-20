import { Spinner } from './icons';

/**
 * LoadingScreen - Simple spinner-based loading indicator
 * Used as fallback for Suspense boundaries
 */
export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <Spinner className="animate-spin text-primary" size={48} />
      <p className="text-sm text-ink2">{message}</p>
    </div>
  );
}

/**
 * Skeleton placeholder components for progressive disclosure
 */
export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 h-4 w-1/3 rounded bg-surface2" />
      <div className="h-20 rounded bg-surface2" />
    </div>
  );
}

export function ListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 h-4 w-2/3 rounded bg-surface2" />
          <div className="h-3 w-full rounded bg-surface2" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 200 }) {
  return (
    <div 
      className="animate-pulse rounded-2xl border border-line bg-surface"
      style={{ height }}
    />
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="mt-2 h-3 w-12 animate-pulse rounded bg-surface2" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Context-specific skeleton loaders
 */
export function TodaySessionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 h-6 w-3/4 rounded bg-surface2" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded bg-surface2" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="flex h-[600px] flex-col">
      {/* Header skeleton */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-surface2" />
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-surface2" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface2" />
        </div>
      </div>
      
      {/* Messages area skeleton */}
      <div className="flex-1 space-y-4 rounded-2xl border border-line bg-surface p-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${i % 2 === 0 ? 'rounded-br-sm' : 'rounded-bl-sm'} bg-surface2`}>
              <div className="h-4 w-full animate-pulse rounded bg-white" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-white" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressChartSkeleton() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-2xl border border-line bg-surface p-6">
        <div className="mb-4 h-6 w-1/2 rounded bg-surface2" />
        <div className="h-64 rounded bg-surface2" />
      </div>
    </div>
  );
}
