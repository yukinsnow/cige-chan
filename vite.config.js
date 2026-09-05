import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/* tauri android dev 要让手机访问到这台机器的 dev server，
   @tauri-apps/cli 会把地址放进 TAURI_DEV_HOST，没有它就只听本机。 */
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [vue()],
  /* Tauri 和 B 站 toys 那种子路径托管都需要相对路径，否则资源 404 */
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,           // 端口漂了 Tauri 就连不上
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    /* 安卓 WebView 版本参差，显式指定，别依赖默认值 */
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
