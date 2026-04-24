import type { PowerUpFeedbackKind } from '@/utils/powerUps';

type WindowWithAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let audioUnavailable = false;

const getAudioContext = (): AudioContext | null => {
  if (audioUnavailable || typeof window === 'undefined') return null;

  const AudioContextCtor = window.AudioContext ?? (window as WindowWithAudioContext).webkitAudioContext;
  if (!AudioContextCtor) {
    audioUnavailable = true;
    return null;
  }

  try {
    audioContext ??= new AudioContextCtor();
    return audioContext;
  } catch {
    audioUnavailable = true;
    return null;
  }
};

const playTone = (context: AudioContext, frequency: number, startsAt: number, duration: number) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.045, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.015);
};

export const playPowerupFeedbackCue = (kind: PowerUpFeedbackKind): void => {
  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    try {
      const now = context.currentTime;
      const notes = kind === 'activated' ? [392, 523.25] : [523.25, 659.25, 783.99];
      notes.forEach((frequency, index) => {
        playTone(context, frequency, now + index * 0.055, kind === 'activated' ? 0.12 : 0.1);
      });
    } catch {
      audioUnavailable = true;
    }
  };

  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => {
      audioUnavailable = true;
    });
    return;
  }

  play();
};
