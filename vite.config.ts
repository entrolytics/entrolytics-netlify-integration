import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
  },
  staged: {
    "*.{js,mjs,cjs,json,md,yml,yaml}": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
});
