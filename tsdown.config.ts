import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/entry/openclaw.ts',
    'src/entry/standalone.ts',
    'src/entry/core.ts',
    'src/entry/telegram-bot.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['openclaw', 'openclaw/*'],
  inlineOnly: false,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
});
