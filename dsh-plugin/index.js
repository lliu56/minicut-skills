/**
 * MiniCut for DeepSeek Harness.
 *
 * Gives the agent the MiniCut CLI (`minicut`), which makes multi-shot AI short
 * films as a project folder: story, shot sheet, pictures, video takes, voice,
 * music and an edited cut, with a check after every step.
 *
 * Three model-facing tools:
 * - `minicut_status`: is the CLI installed, and is this computer signed in. Free.
 * - `minicut_next`: `minicut loop next` in the project folder. Prints the one
 *   command to run next and why. Free.
 * - `minicut_run`: runs one `minicut` command.
 *
 * Money rule. A paid MiniCut command without `--yes` sends nothing to any model:
 * it prints the price and the exact `--yes` line to run, and exits 3. This
 * plugin refuses any `--yes` line unless the call says the user approved that
 * price in this conversation. It never edits the line the CLI printed.
 *
 * The plugin holds no key. Sign-in lives in the CLI (`minicut login`).
 * Commands run with an argument list, never through a shell.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export const name = 'minicut'
export const inject = ['tools']

const IS_WIN = process.platform === 'win32'
const MAX_OUTPUT = 20000
const QUICK_MS = 60000
const LONG_MS = 15 * 60000
const INSTALL_HINT = IS_WIN
  ? 'MiniCut is not installed. Ask the user first, then: curl -fsSL https://minicut.ai/install.cmd -o install.cmd && install.cmd'
  : 'MiniCut is not installed. Ask the user first, then download https://minicut.ai/install.sh, show it to them, and run: sh install.sh --region global'
/** Commands that remove MiniCut or change the computer: the user runs these themselves. */
const BLOCKED = new Set(['uninstall'])

/** An error whose code is useful in the model-facing message. */
export class ToolError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MiniCutError'
    this.code = code
  }
}

/** The launcher the installer writes, else `minicut` on PATH. */
export function launcher(home = homedir()) {
  const own = join(home, '.minicut', 'bin', IS_WIN ? 'minicut.cmd' : 'minicut')
  return existsSync(own) ? own : (IS_WIN ? 'minicut.cmd' : 'minicut')
}

/** The active Session directory, else the process directory. */
export function sessionCwd(ctx, exec) {
  const service = ctx.get?.('workingDirectory')
  if (service !== undefined && exec?.agent !== undefined) {
    try {
      return service.get(exec.agent.session)
    } catch {
      // Fall through to the process directory.
    }
  }
  return process.cwd()
}

function cap(text) {
  return text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + '\n[output cut]' : text
}

/** What an exit code means to the agent, from the CLI's own codes. */
export function meaning(code) {
  if (code === 0) return 'done'
  if (code === 3) return 'price shown: show the user the price and the printed --yes line, and run it only after their yes'
  if (code === 10) return 'not signed in: run minicut login --json and tell the user to sign in in the browser'
  return 'failed: read stderr'
}

/** Run `minicut <args>` with no shell. Resolves with exit code and output. */
export function runMinicut(args, { cwd, signal, timeoutMs, bin = launcher(), spawnFn = spawn } = {}) {
  return new Promise((done, fail) => {
    let out = ''
    let err = ''
    let child
    try {
      child = spawnFn(bin, args, { cwd, shell: false, windowsHide: true })
    } catch (error) {
      fail(error)
      return
    }
    const timer = setTimeout(() => child.kill(), timeoutMs)
    const onAbort = () => child.kill()
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { err += d })
    child.on('error', (error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fail(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      done({ exitCode: code ?? -1, stdout: cap(out), stderr: cap(err) })
    })
  })
}

async function runOrExplain(args, cwd, exec, timeoutMs, deps) {
  if (exec?.signal?.aborted) throw new ToolError('CANCELLED', 'The request was cancelled.')
  try {
    const result = await runMinicut(args, { cwd, signal: exec?.signal, timeoutMs, ...deps })
    return { ...result, meaning: meaning(result.exitCode) }
  } catch (error) {
    if (error?.code === 'ENOENT') throw new ToolError('NOT_INSTALLED', INSTALL_HINT)
    throw new ToolError('RUN_FAILED', String(error?.message ?? error).slice(0, 300))
  }
}

/** Check the words of one `minicut` call. Throws on anything this plugin will not run. */
export function checkArgs(args, approved) {
  if (!Array.isArray(args) || args.length === 0 || !args.every((a) => typeof a === 'string')) {
    throw new ToolError('INVALID_ARGS', 'args must be a non-empty list of strings, without the word minicut.')
  }
  if (args[0] === 'minicut') throw new ToolError('INVALID_ARGS', 'Leave out the word minicut; start with the command, for example ["new", "my-film"].')
  if (BLOCKED.has(args[0])) throw new ToolError('NOT_ALLOWED', `minicut ${args[0]} is for the user to run themselves.`)
  if (args.includes('--yes') && approved !== true) {
    throw new ToolError('NEEDS_APPROVAL', 'This line spends credits. Show the user the price the CLI printed, wait for their yes, then call again with user_approved_price: true and the line exactly as printed.')
  }
}

const runOutput = {
  schema: {
    type: 'object',
    properties: {
      exitCode: { type: 'integer' },
      meaning: { type: 'string' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
    },
    required: ['exitCode', 'meaning', 'stdout', 'stderr'],
    additionalProperties: false,
  },
  render: (_args, value) => [{ type: 'text', text: `minicut exit ${value.exitCode}: ${value.meaning}\n${value.stdout}${value.stderr ? `\n${value.stderr}` : ''}` }],
}

const projectParam = {
  type: 'string',
  description: 'Optional project folder. A relative path is read from the session folder. Default: the session folder.',
}

function folderOf(ctx, exec, project) {
  const base = sessionCwd(ctx, exec)
  if (typeof project !== 'string' || project.trim().length === 0) return base
  return isAbsolute(project) ? project : resolve(base, project)
}

export function createTools(ctx, deps = {}) {
  return [
    {
      name: 'minicut_status',
      description:
        'Check whether the MiniCut CLI is installed and this computer is signed in to minicut.ai. '
        + 'Free. Run it first in any film task.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: runOutput,
      timeoutMs: QUICK_MS,
      async execute(_args, exec) {
        return runOrExplain(['status'], sessionCwd(ctx, exec), exec, QUICK_MS, deps)
      },
    },
    {
      name: 'minicut_next',
      description:
        'Run `minicut loop next` in a MiniCut project folder. It prints the one command to run next and why. '
        + 'Free. Use it after every step of a film until it says every loop is approved or done.',
      parameters: { type: 'object', properties: { project: projectParam }, additionalProperties: false },
      output: runOutput,
      timeoutMs: QUICK_MS,
      async execute(args, exec) {
        return runOrExplain(['loop', 'next'], folderOf(ctx, exec, args?.project), exec, QUICK_MS, deps)
      },
    },
    {
      name: 'minicut_run',
      description:
        'Run one MiniCut CLI command to make an AI short film: for example ["login", "--json"], '
        + '["new", "my-film", "--title", "My film"], or the command minicut_next printed. '
        + 'Exit 3 means a price was shown and nothing was spent: show the user the price and the printed --yes line, '
        + 'wait for their yes, then run that exact line with user_approved_price: true. '
        + 'Exit 10 means not signed in. Never raise --max-credits or change a printed --yes line.',
      parameters: {
        type: 'object',
        properties: {
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'The command words after `minicut`, one per item.',
          },
          project: projectParam,
          user_approved_price: {
            type: 'boolean',
            description: 'True only when the user said yes in this conversation to the exact price for this --yes line.',
          },
        },
        required: ['args'],
        additionalProperties: false,
      },
      output: runOutput,
      timeoutMs: LONG_MS,
      async execute(args, exec) {
        checkArgs(args?.args, args?.user_approved_price)
        return runOrExplain(args.args, folderOf(ctx, exec, args?.project), exec, LONG_MS, deps)
      },
    },
  ]
}

/** Mount the tools; disposal unregisters them. */
export function apply(ctx) {
  for (const tool of createTools(ctx)) {
    ctx.effect(() => ctx.tools.register(tool), `minicut: ${tool.name} tool`)
  }
}
