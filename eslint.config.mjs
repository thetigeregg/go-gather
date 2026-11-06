import { defineConfig, globalIgnores } from 'eslint/config';
import { configs as angularConfigs, processInlineTemplates } from 'angular-eslint';
import { importX } from 'eslint-plugin-import-x';
import unusedImports from 'eslint-plugin-unused-imports';
import { configs as tseslintConfigs } from 'typescript-eslint';

const jsTsFiles = ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'];
const tsFiles = ['**/*.{ts,tsx,mts,cts}'];

// Angular 22's `ng update` pinned these pre-existing components to
// ChangeDetectionStrategy.Eager to preserve their zone-driven behavior. Moving
// them to OnPush is a separate refactor; the rule stays on for everything else,
// so new components can't opt into Eager unnoticed. Remove entries as they move.
const eagerChangeDetectionComponents = [
  'src/app/app.component.ts',
  'src/app/availability-history/availability-history.page.ts',
  'src/app/calendar/calendar-view/calendar-view.component.ts',
  'src/app/calendar/calendar-view/multi-day-event-bar.component.ts',
  'src/app/calendar/calendar-view/single-day-event.component.ts',
  'src/app/calendar/calendar.page.ts',
  'src/app/calendar/event-detail/event-detail.component.ts',
  'src/app/calendar/timeline-view/pokemon-event-images.component.ts',
  'src/app/calendar/timeline-view/pokemon-image.component.ts',
  'src/app/calendar/timeline-view/raid-tier-group-images.component.ts',
  'src/app/calendar/timeline-view/timeline-category-section.component.ts',
  'src/app/calendar/timeline-view/timeline-collapsed-schedule.component.ts',
  'src/app/calendar/timeline-view/timeline-event.component.ts',
  'src/app/calendar/timeline-view/timeline-raid-schedule.component.ts',
  'src/app/calendar/timeline-view/timeline-view.component.ts',
  'src/app/features/availability-changes/availability-changes-modal.component.ts',
  'src/app/features/availability-changes/availability-sections.component.ts',
  'src/app/features/calendar-filter-menu/calendar-filter-menu.component.ts',
  'src/app/features/chip-list-input/chip-list-input.component.ts',
  'src/app/features/excluded-search-term-input/excluded-search-term-input.component.ts',
  'src/app/features/gather-pokemon/gather-pokemon.component.ts',
  'src/app/features/multi-search-string/multi-search-string.component.ts',
  'src/app/features/nav-menu/nav-menu.component.ts',
  'src/app/features/search-string/search-string.component.ts',
  'src/app/features/side-menu/side-menu.component.ts',
  'src/app/gather/gather.page.ts',
  'src/app/preset-queries/edit/preset-query-edit.page.ts',
  'src/app/preset-queries/preset-queries.page.ts',
  'src/app/search-strings/search-strings.page.ts',
  'src/app/settings/settings.page.ts',
  'src/app/tabs/tabs.page.ts',
];

export default defineConfig([
  globalIgnores([
    'dist/**/*',
    'coverage/**/*',
    '.angular/**/*',
    'www/**/*',
    'ios/App/App/public/**/*',
  ]),

  {
    ...importX.flatConfigs.recommended,
    files: jsTsFiles,
  },
  {
    ...importX.flatConfigs.typescript,
    files: jsTsFiles,
  },
  ...tseslintConfigs.strictTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
  })),
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],

    extends: [...angularConfigs.tsRecommended],
    processor: processInlineTemplates,

    plugins: {
      'import-x': importX,
      'unused-imports': unusedImports,
    },

    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',

      parserOptions: {
        project: ['tsconfig.app.json', 'tsconfig.spec.json', 'tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      '@angular-eslint/prefer-standalone': 'off',

      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],

      '@angular-eslint/component-class-suffix': [
        'error',
        {
          suffixes: ['Page', 'Component'],
        },
      ],

      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],

      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],

      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'Capacitor',
          message:
            'Do not use window.Capacitor directly. Import Capacitor plugins from their @capacitor/* packages.',
        },
        {
          object: 'Capacitor',
          property: 'Plugins',
          message:
            'Do not use Capacitor.Plugins directly. Import Capacitor plugins from their @capacitor/* packages.',
        },
      ],
    },
  },
  {
    files: eagerChangeDetectionComponents,
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angularConfigs.templateRecommended],
    rules: {},
  },
]);
