// The visible recovery state for a learner-error gap:
//   Active weakness → Improving → Resolved
// Pure presentation over recoveryStatus() (segmentExplain.js) — the counters
// and thresholds live there, tested; this only lays out the chip.
import { recoveryStatus } from '../lib/segmentExplain';

export default function RecoveryBadge({ entry, status: statusProp }) {
  const recovery = statusProp || recoveryStatus(entry);
  if (!recovery) return null;
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${
      recovery.state === 'Resolved' ? 'bg-success/15 text-success'
        : recovery.state === 'Improving' ? 'bg-warning/15 text-warning'
          : 'bg-ink/10 text-ink2'}`}>
      {recovery.state}
    </span>
  );
}
