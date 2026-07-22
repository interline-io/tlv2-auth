import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { makeUser } from './makeUser'
import type { TlMe } from '../composables/useUser'

describe('makeUser', () => {
  it('reflects later session-state changes on a held reference', () => {
    const auth0User = ref<Record<string, any> | undefined>(undefined)
    const me = ref<TlMe | undefined>(undefined)
    const user = makeUser(auth0User, me)

    // Anonymous at call time.
    expect(user.loggedIn).toBe(false)
    expect(user.roles).toEqual([])
    expect(user.hasRole('admin')).toBe(false)

    // Enrichment populates the session AFTER makeUser() was called.
    auth0User.value = { sub: 'auth0|1', name: 'Alice', email: 'a@b.co' }
    me.value = { id: 'gql-1', name: 'Alice B', email: 'work@b.co', roles: ['editor', 'admin'], external_data: { q: '1' } }

    // The held reference sees the update without re-calling makeUser().
    expect(user.loggedIn).toBe(true)
    expect(user.id).toBe('gql-1')
    expect(user.name).toBe('Alice')
    expect(user.roles).toEqual(['admin', 'editor']) // sorted
    expect(user.hasRole('admin')).toBe(true)
    expect(user.externalData).toEqual({ q: '1' })
  })

  it('applies the id / name / email fallback order', () => {
    const auth0User = ref<Record<string, any> | undefined>({ sub: 'auth0|x', name: 'AuthName' })
    const me = ref<TlMe | undefined>({ id: 'gql-x', name: 'MeName', email: 'me@b.co', roles: null, external_data: {} })
    const user = makeUser(auth0User, me)

    expect(user.id).toBe('gql-x') // me.id wins over auth0 sub
    expect(user.name).toBe('AuthName') // auth0 name wins over me.name
    expect(user.email).toBe('me@b.co') // no auth0 email -> falls back to me.email
    expect(user.roles).toEqual([]) // null roles -> []
  })
})
