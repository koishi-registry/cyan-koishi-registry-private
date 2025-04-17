// tsdown.config.mts
import { defineConfig } from 'tsdown'
import Quansync from 'unplugin-quansync/rolldown'

export default defineConfig({
  entry: ['./file/file.ts'],
  target: "esnext",
  external: ["bun:jsc"],
  plugins: [Quansync(), ],
  outDir: 'dist/'
})
