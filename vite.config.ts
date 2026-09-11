import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function copyPlantUmlRuntime(): Plugin {
  return {
    name: "copy-plantuml-runtime",
    writeBundle() {
      const source = resolve("node_modules/@sakirtemel/plantuml.js");
      const destination = resolve("dist/plantuml-wasm");
      mkdirSync(destination, { recursive: true });
      for (const file of ["plantuml.js", "plantuml-core.jar", "plantuml-core.jar.js"]) {
        copyFileSync(resolve(source, file), resolve(destination, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyPlantUmlRuntime()],
});
