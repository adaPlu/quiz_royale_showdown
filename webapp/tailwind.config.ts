import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: '#6C3EF5',
        gold: '#FFD700',
        'game-bg': '#0E0E1A',
        'game-surface': '#1A1A2E',
        'game-card': '#16213E',
        'game-border': '#2D2D4A',
        'game-muted': '#6B7280',
        'answer-correct': '#22C55E',
        'answer-wrong': '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'timer-tick': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        'card-flip-in': {
          '0%': { transform: 'rotateY(-90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        'correct-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34,197,94,0.7)' },
          '50%': { boxShadow: '0 0 0 16px rgba(34,197,94,0)' },
        },
        'wrong-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-8px)' },
          '40%': { transform: 'translateX(8px)' },
          '60%': { transform: 'translateX(-6px)' },
          '80%': { transform: 'translateX(6px)' },
        },
        'powerup-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'level-pop': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '60%': { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
      },
      animation: {
        'timer-tick': 'timer-tick 1s ease-in-out infinite',
        'card-flip-in': 'card-flip-in 0.4s ease-out',
        'correct-pulse': 'correct-pulse 0.6s ease-out',
        'wrong-shake': 'wrong-shake 0.5s ease-in-out',
        'powerup-float': 'powerup-float 2s ease-in-out infinite',
        'level-pop': 'level-pop 0.5s cubic-bezier(0.175,0.885,0.32,1.275)',
        'ping-slow': 'ping-slow 2s cubic-bezier(0,0,0.2,1) infinite',
        'slide-up': 'slide-up 0.35s ease-out',
        'pulse-ring': 'pulse-ring 1.2s ease-in-out infinite',
      },
      boxShadow: {
        royale: '0 24px 80px rgba(108,62,245,0.35)',
        brand: '0 8px 32px rgba(108,62,245,0.4)',
        card: '0 4px 24px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'game-gradient': 'radial-gradient(circle at top, rgba(108,62,245,0.35), transparent 45%), linear-gradient(180deg, #111122, #090910)',
        'brand-gradient': 'linear-gradient(135deg, #6C3EF5, #9B5DE5)',
      },
    },
  },
  plugins: [],
} satisfies Config;
