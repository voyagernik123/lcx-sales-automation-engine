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
        /* THE LCX BRAND PALETTE, verbatim from "Visual Guidelines - LCX Final 1.0.pdf"
         * page 15 (Primary Palette). Separate from the UI tokens above on purpose:
         * `navy` and friends are this product's interface scale and may be retuned,
         * whereas these five are the company's colours and may not. Use them for the
         * mark, the signature and anything that represents LCX itself rather than a
         * piece of interface — a brand colour used as a UI colour is how a palette
         * drifts. Raw hex here rather than a CSS variable because these do NOT change
         * between light and dark: the book gives one value each. */
        lcx: {
          blue: '#2C6BFF',   // hero
          black: '#262626',
          gray: '#696969',
          sand: '#D5D5D5',
          white: '#FAFAFA',
        },
        ice: { DEFAULT: 'rgb(var(--ice) / <alpha-value>)', soft: 'rgb(var(--ice-soft) / <alpha-value>)' },
        grey: { DEFAULT: 'rgb(var(--grey) / <alpha-value>)', light: 'rgb(var(--grey-light) / <alpha-value>)', dark: 'rgb(var(--grey-dark) / <alpha-value>)' },
        line: 'rgb(var(--line) / <alpha-value>)',
        /* THE CONTROL BOUNDARY, separate from `line` because the two have different
         * WCAG floors and one token cannot serve both. `border-line` measures
         * 1.72 / 1.59 / 1.52 light and 1.30 / 1.42 / 1.16 / 1.03 / 1.45 dark against
         * the surfaces controls actually sit on — against the 3:1 that SC 1.4.11
         * requires for the boundary of a user interface component. `border-control`
         * measures 3.97 / 3.67 / 3.50 and 4.33 / 4.71 / 3.86 / 3.43 / 4.81 on the same
         * eight. Use it on an input, select, textarea, button, label or link edge;
         * leave `line` on table rules, card edges and dividers, where 1.4.11 does not
         * apply and where a 3:1 hairline is no longer a hairline. Both floors are
         * asserted in lib/__tests__/contrast.test.ts. */
        control: 'rgb(var(--control-border) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        accent: { icon: 'rgb(var(--accent-icon) / <alpha-value>)', text: 'rgb(var(--accent-text) / <alpha-value>)' },
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
