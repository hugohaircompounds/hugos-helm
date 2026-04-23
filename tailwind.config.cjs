// Color tokens are CSS vars defined in src/styles/index.css.
// Theme swaps by flipping the `data-theme` attribute on <html>.
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withVar('--bg'),
        panel: withVar('--panel'),
        panelHi: withVar('--panel-hi'),
        border: withVar('--border'),
        ink: withVar('--ink'),
        inkMuted: withVar('--ink-muted'),
        accent: withVar('--accent'),
        success: withVar('--success'),
        warn: withVar('--warn'),
        danger: withVar('--danger'),
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
    },
  },
  plugins: [],
};
