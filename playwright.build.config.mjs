import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// Explicit build checks exercise generated files under a hosting subdirectory.
// The regular browser suite continues to run directly against source modules.
export default defineConfig({ ...base, testDir: './tests/deployment', testMatch: 'startup.spec.mjs' });
