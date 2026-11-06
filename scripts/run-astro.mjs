// Keep project commands self-contained and avoid user-profile telemetry writes.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
await import('../node_modules/astro/astro.js');
