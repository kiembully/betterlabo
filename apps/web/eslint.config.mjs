/**
 * eslint-config-next 16 exports FLAT configs directly, so they are spread into
 * the array rather than routed through `FlatCompat` (which throws
 * `TypeError: Converting circular structure to JSON` when it meets eslint 10).
 */
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
      '**/*.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      /**
       * The console covers admin-pasted image URLs on arbitrary hosts, and the
       * place-holder art is generated SVG, so plain <img> is deliberate here.
       */
      '@next/next/no-img-element': 'off',
      /**
       * Load-once effects that store their result (the map's viewport height, the
       * console's saved filter) are a legitimate pattern for this app.
       */
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
