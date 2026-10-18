import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { colors, schist } from './lib/theme-colors';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ['var(--font-jakarta)', 'var(--font-bangla)', 'system-ui', 'sans-serif'],
        bangla: ['var(--font-bangla)', 'var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(24,31,20,0.04), 0 6px 20px -8px rgba(24,31,20,0.10)',
        lift: '0 2px 6px rgba(24,31,20,0.06), 0 18px 40px -12px rgba(24,31,20,0.22)',
        glow: '0 10px 24px -10px rgba(77,93,72,0.65)',
      },
      backgroundImage: {
        'night-gradient': `linear-gradient(150deg, ${schist[800]} 0%, ${schist[700]} 60%, ${schist[600]} 100%)`,
        'brand-gradient': `linear-gradient(135deg, ${schist[600]} 0%, ${schist[700]} 100%)`,
        'sidebar-gradient': `linear-gradient(180deg, ${schist[200]} 0%, ${schist[300]} 100%)`,
        'accent-gradient': `linear-gradient(135deg, ${schist[300]} 0%, ${schist[400]} 100%)`,
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        progress: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(250%)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        progress: 'progress 1s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
