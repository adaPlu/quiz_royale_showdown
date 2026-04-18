export const DEFAULT_TIMER_GRACE_MS = 500;

export interface TimerValidationInput {
  questionStartedAtMs: number;
  answerReceivedAtMs: number;
  timeLimitMs: number;
  clientReportedElapsedMs?: number;
  graceMs?: number;
}

export interface TimerValidationResult {
  accepted: boolean;
  authoritativeElapsedMs: number;
  scoringElapsedMs: number;
  driftMs: number | null;
  reason: 'accepted' | 'too_early' | 'too_late' | 'client_drift';
}

export function validateAnswerTiming(
  input: TimerValidationInput,
): TimerValidationResult {
  if (input.timeLimitMs <= 0) {
    throw new Error('timeLimitMs must be positive');
  }

  const graceMs = input.graceMs ?? DEFAULT_TIMER_GRACE_MS;
  const authoritativeElapsedMs = input.answerReceivedAtMs - input.questionStartedAtMs;
  const scoringElapsedMs = clamp(authoritativeElapsedMs, 0, input.timeLimitMs);
  const driftMs =
    input.clientReportedElapsedMs == null
      ? null
      : input.clientReportedElapsedMs - authoritativeElapsedMs;

  if (authoritativeElapsedMs < -graceMs) {
    return rejected('too_early', authoritativeElapsedMs, scoringElapsedMs, driftMs);
  }

  if (authoritativeElapsedMs > input.timeLimitMs + graceMs) {
    return rejected('too_late', authoritativeElapsedMs, scoringElapsedMs, driftMs);
  }

  if (driftMs != null && Math.abs(driftMs) > graceMs) {
    return rejected('client_drift', authoritativeElapsedMs, scoringElapsedMs, driftMs);
  }

  return {
    accepted: true,
    authoritativeElapsedMs,
    scoringElapsedMs,
    driftMs,
    reason: 'accepted',
  };
}

function rejected(
  reason: Exclude<TimerValidationResult['reason'], 'accepted'>,
  authoritativeElapsedMs: number,
  scoringElapsedMs: number,
  driftMs: number | null,
): TimerValidationResult {
  return {
    accepted: false,
    authoritativeElapsedMs,
    scoringElapsedMs,
    driftMs,
    reason,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
