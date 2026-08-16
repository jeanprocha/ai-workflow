// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // H1.2: expect.objectContaining/stringContaining (jest) tipam como `any`
    // — atribuir o retorno como valor de propriedade sempre estoura
    // no-unsafe-assignment/no-unsafe-member-access, mesmo com o teste
    // correto. Restrito a *.spec.ts (nunca afrouxa codigo de producao).
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Mesma razao, para os demais dublês de teste:
      // - require-await: `jest.fn(async () => valor)` e a forma canonica de
      //   mockar funcao assincrona; nao ha o que aguardar dentro do mock.
      // - no-unsafe-call / no-unsafe-return: chamar e retornar a partir de
      //   mocks tipados como `any` (jest.Mock, objetos parciais de Prisma).
      // - unbound-method: passar `service.metodo` para `expect`/spy sem
      //   vincular `this` e intencional em asserts.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
