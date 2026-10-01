// node --test supabase/functions/account-setup/account-setup.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handle, type Deps, type Redeemed } from './service.ts'
import {
  formatToken, generateToken, hashToken, normalizeLoginID, normalizeToken, passwordProblem, setupURL, syntheticEmail,
  TOKEN_ALPHABET, TOKEN_LENGTH,
} from './tokens.ts'

test('tokens use only unambiguous characters and round-trip through the typed form', () => {
  for (let i = 0; i < 200; i++) {
    const token = generateToken()
    assert.equal(token.length, TOKEN_LENGTH)
    for (const ch of token) assert.ok(TOKEN_ALPHABET.includes(ch))
    assert.equal(normalizeToken(formatToken(token)), token)
    assert.equal(normalizeToken(formatToken(token).toLowerCase().replaceAll('-', ' ')), token)
  }
  assert.equal(normalizeToken('ABCD-EFGH-JKMN-PQRS'), 'ABCDEFGHJKMNPQRS')
  assert.equal(normalizeToken('ＡＢＣＤ－ＥＦＧＨ－ＪＫＭＮ－ＰＱＲＳ'), 'ABCDEFGHJKMNPQRS')
  assert.equal(normalizeToken('ABCD-EFGH-JKMN-PQR0'), null) // 0 is not in the alphabet
  assert.equal(normalizeToken('ABCD'), null)
  assert.equal(setupURL('ABCDEFGHJKMNPQRS'), 'kyoei://setup?t=ABCDEFGHJKMNPQRS')
})

test('token hashes are stable SHA-256 hex', async () => {
  assert.equal(await hashToken('ABCDEFGHJKMNPQRS'), await hashToken('ABCDEFGHJKMNPQRS'))
  assert.match(await hashToken('ABCDEFGHJKMNPQRS'), /^[0-9a-f]{64}$/)
})

test('login IDs and synthetic emails', () => {
  assert.equal(normalizeLoginID(' １００１ '), '1001')
  assert.equal(normalizeLoginID('Kyoei.Taro'), 'kyoei.taro')
  assert.equal(normalizeLoginID('ab'), null)
  assert.equal(normalizeLoginID('名前'), null)
  assert.equal(syntheticEmail('1001'), '1001@id.kyoei.invalid')
})

test('password rules', () => {
  assert.equal(passwordProblem('1234567'), 'パスワードは8文字以上にしてください')
  assert.equal(passwordProblem('12345678'), null)
})

function deps(redeemed: Redeemed | null, overrides: Partial<Deps> = {}) {
  const calls: string[] = []
  const d: Deps = {
    redeem: async () => { calls.push('redeem'); return redeemed },
    release: async () => void calls.push('release'),
    setPassword: async () => void calls.push('setPassword'),
    ...overrides,
  }
  return { d, calls }
}

const TOKEN = 'ABCD-EFGH-JKMN-PQRS'

test('redeems a valid token and sets the password', async () => {
  const { d, calls } = deps({ user_id: 'u1', login_id: '1001', purpose: 'setup' })
  const outcome = await handle({ token: TOKEN, password: 'correct horse' }, d)
  assert.deepEqual(outcome, { status: 200, body: { loginId: '1001', purpose: 'setup' } })
  assert.deepEqual(calls, ['redeem', 'setPassword'])
})

test('rejects bad input before touching the database', async () => {
  const { d, calls } = deps({ user_id: 'u1', login_id: '1001', purpose: 'setup' })
  assert.equal((await handle({ token: 'nope', password: 'correct horse' }, d)).status, 400)
  assert.equal((await handle({ token: TOKEN, password: 'short' }, d)).status, 400)
  assert.equal((await handle({ token: TOKEN }, d)).status, 400)
  assert.deepEqual(calls, [])
})

test('used, expired or disabled tokens are refused', async () => {
  const { d } = deps(null)
  assert.equal((await handle({ token: TOKEN, password: 'correct horse' }, d)).status, 410)
})

test('a failed password update releases the token for another try', async () => {
  const { d, calls } = deps({ user_id: 'u1', login_id: '1001', purpose: 'reset' }, {
    setPassword: async () => { throw new Error('auth down') },
  })
  const outcome = await handle({ token: TOKEN, password: 'correct horse' }, d)
  assert.equal(outcome.status, 500)
  assert.deepEqual(calls, ['redeem', 'release'])
})
