import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        // Node 25+ ships its own localStorage global, which is undefined without
        // --localstorage-file and hides jsdom's. Turn it off so tests get jsdom's.
        execArgv: Number(process.versions.node.split('.')[0]) >= 25 ? ['--no-webstorage'] : [],
    },
})
