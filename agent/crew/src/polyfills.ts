import { Buffer } from 'buffer'
import process from 'process'

const g = globalThis as typeof globalThis & {
  Buffer: typeof Buffer
  process: typeof process
  global: typeof globalThis
}

g.Buffer = Buffer
g.process = process
g.global = globalThis
