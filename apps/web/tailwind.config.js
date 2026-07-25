export default {
  // Tests are excluded from the content scan: a class name written in a comment
  // or a regex inside a test is otherwise compiled into the shipped stylesheet.
  // That is how `.focus\:outline-none:focus` and
  // `.focus-visible\:outline-none:focus-visible` — both of which BLANK a focus
  // ring — survived in dist/ after every real usage had been removed, purely
  // because the ratchet test that forbids them mentions them.
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '!./src/**/__tests__/**',
    '!./src/**/*.test.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: 'rgb(var(--navy) / <alpha-value>)', deep: 'rgb(var(--navy-deep) / <alpha-value>)' },
        ice: { DEFAULT: 'rgb(var(--ice) / <alpha-value>)', soft: 'rgb(var(--ice-soft) / <alpha-value>)' },
        grey: { DEFAULT: 'rgb(var(--grey) / <alpha-value>)', light: 'rgb(var(--grey-light) / <alpha-value>)', dark: 'rgb(var(--grey-dark) / <alpha-value>)' },
        line: 'rgb(var(--line) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        page: 'rgb(var(--page-bg) / <alpha-value>)',
        status: {
          ready: 'rgb(var(--green) / <alpha-value>)',
          'ready-bg': 'rgb(var(--green-bg) / <alpha-value>)',
          conditional: 'rgb(var(--amber) / <alpha-value>)',
          'conditional-bg': 'rgb(var(--amber-bg) / <alpha-value>)',
          blocked: 'rgb(var(--red) / <alpha-value>)',
          'blocked-bg': 'rgb(var(--red-bg) / <alpha-value>)',
          deferred: 'rgb(var(--grey) / <alpha-value>)',
          'deferred-bg': 'rgb(var(--ice-soft) / <alpha-value>)',
          unverified: 'rgb(var(--indigo) / <alpha-value>)',
          'unverified-bg': 'rgba(var(--indigo) / 0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        // Elevation system — values swap per theme via CSS vars in tokens.css.
        card: 'var(--shadow-card)',
        'card-md': 'var(--shadow-card-md)',
        overlay: 'var(--shadow-overlay)',
      },
      // Institutional geometry: crisper than Tailwind defaults. Remapping the
      // scale here rebalances every rounded-* usage app-wide — controls stay
      // 4px, cards land at 6-8px, nothing consumer-soft.
      borderRadius: {
        lg: '0.375rem', // 6px (default 8px)
        xl: '0.5rem', // 8px (default 12px)
        '2xl': '0.625rem', // 10px (default 16px)
        '3xl': '0.75rem', // 12px (default 24px)
      },
      fontSize: {
        // Named density scale — replaces arbitrary text-[10px]/text-[11px].
        // `micro` is the new minimum (11px), reserved for dense data-table cells.
        micro: ['11px', '1.3'],
        label: ['12px', '1.35'],
        body: ['13px', '1.5'],
      },
      gridTemplateColumns: {
        '24': 'repeat(24, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};
