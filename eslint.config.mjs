import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import jupyterPlugin from '@jupyter/eslint-plugin';

export default defineConfig([
  {
    ignores: [
      'node_modules',
      'dist',
      'coverage',
      '**/*.js',
      '**/*.d.ts',
      '.venv',
      'tests',
      '**/__tests__',
      'ui-tests',
      'demo',
      'python/jupyterlite-ai/jupyterlite_ai',
      'python/jupyternaut-persona/jupyternaut_persona',
      'python/jupyternaut-pi/jupyternaut_pi',
      'python/jupyternaut-terminal/jupyternaut_terminal',
      'packages/pi/shims'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      jupyter: jupyterPlugin
    }
  },
  jupyterPlugin.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node
      },
      parserOptions: {
        project: 'tsconfig.json',
        sourceType: 'module'
      }
    },
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: true
          }
        }
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' }
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@stylistic/quotes': [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: 'never' }
      ],
      curly: ['error', 'all'],
      eqeqeq: 'error',
      'prefer-arrow-callback': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mui/icons-material',
              message:
                "Please import icons using path imports, e.g. `import AddIcon from '@mui/icons-material/Add'`"
            }
          ],
          patterns: [
            {
              group: ['@mui/*/*/*'],
              message: '3rd level imports in mui are considered private'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  prettierRecommended
]);
