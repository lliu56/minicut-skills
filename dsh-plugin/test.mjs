// Tests with a fake host and a fake `minicut`: no network, no real CLI, nothing paid.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { apply, checkArgs, createTools, meaning, name, inject } from './index.js'

function fakeSpawn(code, out = '', err = '', calls = []) {
  return (bin, args, opts) => {
    calls.push({ bin, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setImmediate(() => {
      if (out) child.stdout.emit('data', out)
      if (err) child.stderr.emit('data', err)
      child.emit('close', code)
    })
    return child
  }
}
const ctx = { get: () => undefined }
const exec = { signal: new AbortController().signal }

let passed = 0
async function test(label, fn) { await fn(); passed++; console.log('ok', label) }

await test('exports name and inject', () => {
  assert.equal(name, 'minicut')
  assert.deepEqual(inject, ['tools'])
})

await test('apply registers 3 tools through ctx.effect', () => {
  const registered = []
  apply({ get: () => undefined, effect: (fn) => fn(), tools: { register: (t) => { registered.push(t.name); return () => {} } } })
  assert.deepEqual(registered, ['minicut_status', 'minicut_next', 'minicut_run'])
})

await test('status runs `minicut status` with no shell', async () => {
  const calls = []
  const [status] = createTools(ctx, { spawnFn: fakeSpawn(0, 'signed in\n', '', calls), bin: 'minicut' })
  const r = await status.execute({}, exec)
  assert.deepEqual(calls[0].args, ['status'])
  assert.equal(calls[0].opts.shell, false)
  assert.equal(r.meaning, 'done')
})

await test('next runs `minicut loop next` in the project folder', async () => {
  const calls = []
  const [, next] = createTools(ctx, { spawnFn: fakeSpawn(0, '{"cmd":"minicut write story"}', '', calls), bin: 'minicut' })
  await next.execute({ project: '/tmp/my-film' }, exec)
  assert.deepEqual(calls[0].args, ['loop', 'next'])
  assert.equal(calls[0].opts.cwd, '/tmp/my-film')
})

await test('exit 3 is reported as a price, not an error', async () => {
  const [, , run] = createTools(ctx, { spawnFn: fakeSpawn(3, 'price: 40 credits'), bin: 'minicut' })
  const r = await run.execute({ args: ['gen', 'video', 's01'] }, exec)
  assert.equal(r.exitCode, 3)
  assert.match(r.meaning, /price shown/)
})

await test('a --yes line without approval is refused before anything runs', async () => {
  const calls = []
  const [, , run] = createTools(ctx, { spawnFn: fakeSpawn(0, '', '', calls), bin: 'minicut' })
  await assert.rejects(run.execute({ args: ['gen', 'video', 's01', '--yes', '--max-credits', '40'] }, exec), { code: 'NEEDS_APPROVAL' })
  assert.equal(calls.length, 0)
})

await test('a --yes line with approval runs exactly as given', async () => {
  const calls = []
  const line = ['gen', 'video', 's01', '--yes', '--max-credits', '40', '--key', 'k', '--quote', 'q']
  const [, , run] = createTools(ctx, { spawnFn: fakeSpawn(0, 'job started', '', calls), bin: 'minicut' })
  await run.execute({ args: line, user_approved_price: true }, exec)
  assert.deepEqual(calls[0].args, line)
})

await test('uninstall and a leading "minicut" are refused', () => {
  assert.throws(() => checkArgs(['uninstall']), { code: 'NOT_ALLOWED' })
  assert.throws(() => checkArgs(['minicut', 'status']), { code: 'INVALID_ARGS' })
  assert.throws(() => checkArgs([]), { code: 'INVALID_ARGS' })
})

await test('a missing CLI gives the install hint', async () => {
  const missing = () => { const e = new Error('spawn minicut ENOENT'); e.code = 'ENOENT'; throw e }
  const [status] = createTools(ctx, { spawnFn: missing, bin: 'minicut' })
  await assert.rejects(status.execute({}, exec), { code: 'NOT_INSTALLED' })
})

await test('exit 10 says sign in', () => {
  assert.match(meaning(10), /not signed in/)
})

console.log(`${passed} passed`)
