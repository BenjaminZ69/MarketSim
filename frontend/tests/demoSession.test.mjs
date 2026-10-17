import assert from 'node:assert/strict'
import test from 'node:test'
import { clearDemoSession, createDemoSession, hasDemoSession } from '../src/services/demoSession.ts'

function withSessionStorage(run) {
  const values = new Map()
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  }

  try {
    run(values)
  } finally {
    delete globalThis.window
  }
}

test('creates only a harmless demo-session flag', () => {
  withSessionStorage((values) => {
    assert.equal(hasDemoSession(), false)
    createDemoSession()
    assert.equal(hasDemoSession(), true)
    assert.deepEqual([...values.entries()], [['marketsim-demo-session', 'active']])
  })
})

test('clears the demo session so protected dashboard access is denied', () => {
  withSessionStorage(() => {
    createDemoSession()
    assert.equal(hasDemoSession(), true)
    clearDemoSession()
    assert.equal(hasDemoSession(), false)
  })
})
