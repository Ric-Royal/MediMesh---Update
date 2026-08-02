import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      {
        name: 'medimesh-jsx-in-js',
        enforce: 'pre',
        async transform(source, id) {
          if (!/\/src\/.*\.js$/.test(id.replaceAll('\\', '/'))) {
            return null;
          }
          return transformWithEsbuild(source, id, {
            loader: 'jsx',
            jsx: 'automatic'
          });
        }
      },
      react()
    ],
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx'
        }
      }
    },
    define: {
      __IS_PRODUCTION__: JSON.stringify(mode === 'production'),
      __API_URL__: JSON.stringify(env.VITE_API_URL || ''),
      __WS_URL__: JSON.stringify(env.VITE_WS_URL || ''),
      __IDENTITY_MODE__: JSON.stringify(env.VITE_IDENTITY_MODE || 'local'),
      __KEYCLOAK_URL__: JSON.stringify(env.VITE_KEYCLOAK_URL || 'http://localhost:8080'),
      __KEYCLOAK_REALM__: JSON.stringify(env.VITE_KEYCLOAK_REALM || 'medimesh'),
      __KEYCLOAK_CLIENT_ID__: JSON.stringify(env.VITE_KEYCLOAK_CLIENT_ID || 'medimesh-client'),
      __SHOW_DEMO_LOGIN__: JSON.stringify(env.VITE_SHOW_DEMO_LOGIN === 'true')
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://patient-api:3000',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'ws://patient-api:3000',
          ws: true
        }
      }
    },
    build: {
      sourcemap: false,
      outDir: 'dist'
    }
  };
});
