/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Static palette — kept stable so Tailwind opacity modifiers
        // (.../40 etc.) keep working. useBranding() writes the same logical
        // tokens to document.documentElement as --accesly-primary etc., and
        // any component that wants live-branded colour reads the vars
        // directly via style or by extending here once the palette is stable.
        accesly: {
          ink: '#0b0f17',
          bg: '#f6f7fb',
          card: '#ffffff',
          accent: '#5b6cff',
          accentDark: '#4453d8',
          subtle: '#7a8597',
          border: '#e3e6ee',
          success: '#16a34a',
          danger: '#dc2626',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
