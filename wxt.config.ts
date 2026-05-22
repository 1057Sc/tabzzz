import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'TabZZZ',
    description: 'Sleep inactive Chrome tabs with native discard and local memory-pressure estimates.',
    version: '1.2.0',
    permissions: [
      'tabs',
      'tabGroups',
      'storage',
      'alarms',
      'system.memory',
    ],
    action: {
      default_title: 'TabZZZ',
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '128': 'icon/128.png',
      },
    },
  },
});
