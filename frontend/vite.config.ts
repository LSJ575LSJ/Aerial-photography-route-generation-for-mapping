import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(
      {componentInspector: false, // 禁用组件检查器以减少沙盒问题
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'mapbox-gl': 'maplibre-gl'
    },
  },
  build: {
    rollupOptions: {
      // 移除 external 配置，让 Vite 正常打包所有依赖
    },
    commonjsOptions: {
      include: [/maplibre-gl/, /node_modules/]
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        // target: 'http://192.168.1.134:6100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
})
