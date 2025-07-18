// tsdown.config.mts
import { defineConfig } from 'tsdown'
import Quansync from 'unplugin-quansync/rolldown'

export default defineConfig({
  entry: ['./file/file.ts'],
  target: "esnext",
  external: ["@std/streams", "@kra/path"],
  plugins: [Quansync(), ],
  outDir: 'dist/'
})
