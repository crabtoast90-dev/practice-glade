import { defineConfig } from 'vite';

// Relative base so the build works at https://<user>.github.io/practice-glade/
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1500 } });
