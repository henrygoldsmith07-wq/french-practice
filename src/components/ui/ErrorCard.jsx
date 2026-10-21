import { AlertCircle, RefreshCw, HelpCircle, X } from '../icons';
import { ICON_BTN_ROUND_SOFT } from '../classNames.js';

/**
 * Context-specific error message mappings
 * Each feature area can define its own user-friendly messages
 */
const CONTEXT_MESSAGES = {
  conversation: {
    network: "Can't reach the conversation server — check your connection and try again",
    unauthorized: "Your AI key has expired or is invalid. Please update it in Settings.",
    rateLimited: "Too many requests right now. Wait a moment and try again.",
    generic: "The conversation partner isn't available right now. You can still practise with dictée or grammar.",
  },
  exams: {
    network: "Exam papers aren't loading — try reloading when you're back online",
    audioError: "Audio playback failed. Your browser may not support this format.",
    generic: "The exam simulator encountered an issue. Your local progress is saved.",
  },
  dictation: {
    audioError: "Could not load audio. Check your connection and try again.",
    generic: "Dictation service temporarily unavailable. Try another practice mode.",
  },
  vocabulary: {
    network: "Vocabulary cards aren't loading — check your connection",
    generic: "Vocabulary library unavailable at the moment.",
  },
  learningPath: {
    network: "Learning path data isn't loading — please refresh",
    generic: "The learning path is temporarily unavailable.",
  },
  grammar: {
    network: "Grammar exercises aren't loading — try refreshing",
    generic: "Grammar content temporarily unavailable.",
  },
  sync: {
    conflict: "Your progress on this device is newer. Keeping your local changes.",
    quotaExceeded: "Storage quota exceeded. Some data couldn't be saved.",
    encryptionError: "Sync data is corrupted or encrypted incorrectly. Check your passphrase.",
    generic: "Sync failed. Your local progress is safe.",
  },
  aiHub: {
    apiKeyMissing: "AI key required for this feature. Add it in Settings to enable.",
    providerDown: "AI provider is temporarily unavailable. Try again later.",
    generic: "AI tutor isn't available right now.",
  },
};

/**
 * ErrorCard - Reusable error display component with context-aware messages
 * 
 * @param {Object} props
 * @param {string} props.context - Feature context (conversation, exams, etc.)
 * @param {string} props.errorType - Specific error type (network, unauthorized, etc.)
 * @param {string} props.customMessage - Optional custom message overriding context defaults
 * @param {Function} props.onRetry - Optional retry handler
 * @param {boolean} props.dismissible - Whether user can dismiss the error
 * @param {Function} props.onDismiss - Optional dismiss handler
 * @param {React.ReactNode} props.children - Optional fallback content
 */
export default function ErrorCard({
  context,
  errorType,
  customMessage,
  onRetry,
  onHelp,
  dismissible = false,
  onDismiss,
  children,
  className = '',
}) {
  // Get message from context mapping or use generic/default
  const getErrorMessage = () => {
    if (customMessage) return customMessage;
    if (context && CONTEXT_MESSAGES[context] && CONTEXT_MESSAGES[context][errorType]) {
      return CONTEXT_MESSAGES[context][errorType];
    }
    if (errorType) {
      const genericMessages = {
        network: "Something went wrong while fetching data. Check your connection.",
        unauthorized: "Authentication failed. Please sign in again.",
        rateLimited: "Too many requests. Please wait a moment before trying again.",
        validation: "Invalid data received. Please refresh the page.",
        timeout: "Request timed out. Please try again.",
        offline: "You're offline. Some features require an internet connection.",
        unknown: "An unexpected error occurred. Please try again.",
      };
      return genericMessages[errorType] || genericMessages.unknown;
    }
    return "Something went wrong. Please try again.";
  };

  const title = "Something went wrong";
  const message = getErrorMessage();
  const showRetry = Boolean(onRetry);
  const showHelp = Boolean(onHelp);
  const showDismiss = dismissible && Boolean(onDismiss);

  return (
    <div
      role="alert"
      className={`flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-amber/20 bg-amber/5 p-6 ${className}`}
    >
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber/10">
        <AlertCircle size={32} className="text-amber500" />
      </div>

      {/* Title */}
      <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>

      {/* Message */}
      <p className="mt-2 max-w-md text-center text-sm text-ink2">{message}</p>

      {/* Action buttons */}
      <div className="mt-6 flex gap-3">
        {showRetry && (
          <button
            onClick={onRetry}
            className={`inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 ${ICON_BTN_ROUND_SOFT}`}
          >
            <RefreshCw size={16} className="transition-transform" />
            Retry
          </button>
        )}

        {showHelp && (
          <button
            onClick={onHelp}
            className={`inline-flex items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface3 ${ICON_BTN_ROUND_SOFT}`}
          >
            <HelpCircle size={16} />
            Get Help
          </button>
        )}

        {!showRetry && !showHelp && (
          <a
            href="/"
            className={`inline-flex items-center gap-2 rounded-xl border border-line bg-surface2 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface3 ${ICON_BTN_ROUND_SOFT}`}
          >
            Go Home
          </a>
        )}

        {showDismiss && (
          <button
            onClick={onDismiss}
            className={`inline-flex items-center gap-2 rounded-xl border border-line bg-transparent px-4 py-2.5 text-sm font-medium text-ink2 transition-colors hover:text-ink ${ICON_BTN_ROUND_SOFT}`}
            aria-label="Dismiss error"
          >
            <X size={16} />
            Dismiss
          </button>
        )}
      </div>

      {/* Developer info (hidden in production) */}
      {/* import.meta.env.DEV, not process.env.NODE_ENV — `process` does not
          exist in a browser bundle, so the Node idiom would throw a
          ReferenceError inside the very component that exists to show errors. */}
      {import.meta.env.DEV && children && (
        <details className="mt-6 w-full max-w-md">
          <summary className="cursor-pointer text-xs text-ink3">
            Technical details (development mode)
          </summary>
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-line bg-surface2 p-3">
            <pre className="max-w-full text-xs text-ink3 whitespace-pre-wrap break-words">
              {children}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
