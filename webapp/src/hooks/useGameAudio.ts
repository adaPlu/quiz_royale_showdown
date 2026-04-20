import { useCallback, useRef } from 'react';

interface GameAudioApi {
  playCorrect: () => void;
  playWrong: () => void;
  playElimination: () => void;
  playVictory: () => void;
  playPowerup: () => void;
}

function getCtx(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.18
) {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  vol.gain.setValueAtTime(gain, startAt);
  vol.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.01);
}

export function useGameAudio(): GameAudioApi {
  const ctxRef = useRef<AudioContext | null>(null);

  const ctx = useCallback((): AudioContext | null => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = getCtx();
    }
    if (ctxRef.current?.state === 'suspended') {
      ctxRef.current.resume().catch(() => undefined);
    }
    return ctxRef.current;
  }, []);

  const playCorrect = useCallback(() => {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(c, 523, t, 0.12);        // C5
    tone(c, 659, t + 0.14, 0.18); // E5
  }, [ctx]);

  const playWrong = useCallback(() => {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(c, 220, t, 0.18, 'sawtooth', 0.12);
    tone(c, 180, t + 0.15, 0.22, 'sawtooth', 0.10);
  }, [ctx]);

  const playElimination = useCallback(() => {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(c, 440, t, 0.15, 'square', 0.15);
    tone(c, 330, t + 0.18, 0.20, 'square', 0.12);
    tone(c, 220, t + 0.40, 0.35, 'square', 0.08);
  }, [ctx]);

  const playVictory = useCallback(() => {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone(c, freq, t + i * 0.14, 0.18, 'sine', 0.2);
    });
  }, [ctx]);

  const playPowerup = useCallback(() => {
    const c = ctx(); if (!c) return;
    const osc = c.createOscillator();
    const vol = c.createGain();
    osc.connect(vol);
    vol.connect(c.destination);
    osc.type = 'sine';
    const t = c.currentTime;
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.1);
    vol.gain.setValueAtTime(0.18, t);
    vol.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.13);
  }, [ctx]);

  return { playCorrect, playWrong, playElimination, playVictory, playPowerup };
}
