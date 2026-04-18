import { describe, expect, it } from 'vitest';

import { validateAnswerTiming } from '../TimerAuthority';

describe('TimerAuthority', () => {
  it('accepts answers inside the late grace window and clamps scoring time', () => {
    const result = validateAnswerTiming({
      questionStartedAtMs: 10_000,
      answerReceivedAtMs: 15_300,
      timeLimitMs: 5_000,
    });

    expect(result).toMatchObject({
      accepted: true,
      authoritativeElapsedMs: 5_300,
      scoringElapsedMs: 5_000,
      reason: 'accepted',
    });
  });

  it('rejects answers that arrive beyond the grace window', () => {
    const result = validateAnswerTiming({
      questionStartedAtMs: 10_000,
      answerReceivedAtMs: 15_600,
      timeLimitMs: 5_000,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('too_late');
  });

  it('rejects client reports that drift too far from the authoritative time', () => {
    const result = validateAnswerTiming({
      questionStartedAtMs: 10_000,
      answerReceivedAtMs: 13_000,
      timeLimitMs: 5_000,
      clientReportedElapsedMs: 3_900,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('client_drift');
    expect(result.driftMs).toBe(900);
  });
});
