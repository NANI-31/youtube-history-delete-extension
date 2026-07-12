import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import fs from "fs";

function copyAssets() {
  return {
    name: "copy-assets",
    closeBundle() {
      const destDir = resolve(__dirname, "dist");
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy manifest.json
      const manifestSrc = resolve(__dirname, "src/manifest.json");
      const manifestDest = resolve(destDir, "manifest.json");
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, manifestDest);
        console.log("Successfully copied manifest.json to dist/");
      } else {
        console.error("manifest.json not found at " + manifestSrc);
      }

      // Copy size-specific icon files
      const icons = ["icon16.png", "icon32.png", "icon48.png", "icon128.png"];
      icons.forEach((iconName) => {
        const iconSrc = resolve(__dirname, iconName);
        const iconDest = resolve(destDir, iconName);
        if (fs.existsSync(iconSrc)) {
          fs.copyFileSync(iconSrc, iconDest);
          console.log(`Successfully copied ${iconName} to dist/`);
        } else {
          console.error(`${iconName} not found at ${iconSrc}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyAssets()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "src/background/background.js"),
        content: resolve(__dirname, "src/content/content.js"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background" || chunkInfo.name === "content") {
            return "[name].js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]"
      },
    },
  },
});
