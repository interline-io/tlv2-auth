// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Inlined from @interline-io/tlv2-ui/lib/config (removing tlv2-ui dependency)
const ignoreFiles = {
  ignores: [
    '.nuxt/**',
    '.output/**',
    '**/.nuxt',
    'dist/**',
    'node_modules/**',
  ],
}

const eslintTypescriptRules = {
  'no-console': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/unified-signatures': 'off',
}

const eslintStylisticRules = {
  'vue/multi-word-component-names': 'off',
  'vue/max-attributes-per-line': ['error', {
    singleline: { max: 10 },
    multiline: { max: 1 },
  }],
  '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
  '@stylistic/space-before-function-paren': ['error', {
    anonymous: 'always',
    named: 'always',
    asyncArrow: 'always',
  }],
  '@stylistic/comma-dangle': 'off',
  '@stylistic/max-statements-per-line': ['error', { max: 3 }],
}

const stylisticConfig = {
  flat: true,
  indent: 2,
  quotes: 'single' as const,
  semi: false,
}

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: stylisticConfig,
    typescript: {
      strict: true,
    },
  },
  dirs: {
    src: [
      '.',
      './playground',
    ],
  },
})
  .prepend(ignoreFiles)
  .append({
    rules: {
      ...eslintTypescriptRules,
      ...eslintStylisticRules,
    } as Record<string, any>,
  })
