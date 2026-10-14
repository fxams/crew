/**
 * Minimal ElizaOS 1.x shapes (peer: @elizaos/core).
 * Kept local so the package builds without conditional-export resolution quirks.
 */

export interface Memory {
  content: { text?: string; source?: string; [key: string]: unknown }
}

export interface ActionResult {
  success: boolean
  text?: string
  values?: Record<string, unknown>
  data?: Record<string, unknown>
  error?: string | Error
}

export interface IAgentRuntime {
  getSetting(key: string): string | boolean | null | undefined
}

export interface Action {
  name: string
  similes?: string[]
  description: string
  validate: (runtime: IAgentRuntime, message: Memory, state?: unknown) => Promise<boolean>
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: unknown,
    options?: Record<string, unknown>,
    callback?: (response: Memory['content']) => Promise<Memory[]>,
  ) => Promise<ActionResult | void | undefined>
}

export interface Provider {
  name: string
  description?: string
  dynamic?: boolean
  position?: number
  get: (
    runtime: IAgentRuntime,
    message: Memory,
    state: unknown,
  ) => Promise<{ text?: string; values?: Record<string, unknown>; data?: Record<string, unknown> }>
}

export interface Plugin {
  name: string
  description: string
  config?: Record<string, string | number | boolean | null | undefined>
  actions?: Action[]
  providers?: Provider[]
  init?: (config: Record<string, string>, runtime: IAgentRuntime) => Promise<void>
}
