import { Spinner } from './icons';

/**
 * ScreenLoader - Default loading state for route transitions
 * Replaces generic "ScreenLoader" pattern with more descriptive loading
 */
export default function ScreenLoader({ message }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <Spinner size={48} className="animate-spin text-primary" />
      <p className="text-sm text-ink2">{message || 'Loading...'}</p>
    </div>
  );
}

/**
 * Context-aware screen loaders with progress estimation
 */
export function TodayLoader() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 h-8 w-3/4 rounded bg-surface2" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded bg-surface2" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConversationLoader() {
  return (
    <div className="flex h-[600px] flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-surface2" />
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-surface2" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface2" />
        </div>
      </div>
      <div className="flex-1 space-y-4 rounded-2xl border border-line bg-surface p-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${i % 2 === 0 ? 'rounded-br-sm' : 'rounded-bl-sm'} bg-surface2`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function VocabularyLoader() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 h-6 w-2/3 rounded bg-surface2" />
          <div className="h-12 rounded bg-surface2" />
        </div>
      ))}
    </div>
  );
}

export function ProgressLoader() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-2xl border border-line bg-surface p-6">
        <div className="mb-4 h-6 w-1/2 rounded bg-surface2" />
        <div className="h-64 rounded bg-surface2" />
      </div>
    </div>
  );
}
