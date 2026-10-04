import { defineConfig, mergeConfig } from "vitest/config";

import config from "./vitest.config";

// This audit must not read local credentials from Vite's default .env files.
export default mergeConfig(config, defineConfig({ envDir: false }));
