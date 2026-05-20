import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// framer-motion: capture scaleX values set/started by animation controls
const capturedSets: number[] = [];
const capturedStarts: number[] = [];

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ animate: _a, ...props }: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ type: 'div', ...props } as any),
  },
  useAnimationControls: () => ({
    set: (_v: Record<string, number>) => capturedSets.push(_v.scaleX),
    start: (v: Record<string, number> | { scaleX: number }) => {
      capturedStarts.push((v as { scaleX: number }).scaleX);
      return Promise.resolve();
    },
    stop: vi.fn(),
  }),
}));

import { CountdownBar } from '../CountdownBar';

describe('CountdownBar', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    capturedSets.length = 0;
    capturedStarts.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets initialScale to 1.0 when startedAt is now', () => {
    render(
      <CountdownBar duration={10} startedAt={new Date(NOW).toISOString()} />,
    );
    expect(capturedSets[0]).toBeCloseTo(1, 1);
  });

  it('sets initialScale to 0 when the full duration has already elapsed', () => {
    const startedAt = new Date(NOW - 11_000).toISOString(); // 11s ago, duration=10
    render(<CountdownBar duration={10} startedAt={startedAt} />);
    expect(capturedSets[0]).toBe(0);
  });

  it('clamps to 0 — never goes negative', () => {
    const startedAt = new Date(NOW - 99_000).toISOString();
    render(<CountdownBar duration={10} startedAt={startedAt} />);
    expect(capturedSets[0]).toBeGreaterThanOrEqual(0);
  });

  it('clamps to 1 — never exceeds full bar even if startedAt is in the future', () => {
    const startedAt = new Date(NOW + 5_000).toISOString(); // starts in 5s
    render(<CountdownBar duration={10} startedAt={startedAt} />);
    expect(capturedSets[0]).toBeLessThanOrEqual(1);
  });
});
