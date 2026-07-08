<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1>Session &amp; auth debug</h1>

    <p style="margin-top: 0.5rem;">
      <NuxtLink to="/">
        Home
      </NuxtLink>
      <NuxtLink to="/fetch" style="margin-left: 1rem;">
        Vanilla fetch
      </NuxtLink>
      <NuxtLink to="/apollo" style="margin-left: 1rem;">
        Apollo
      </NuxtLink>
    </p>

    <section style="margin-top: 1.5rem;">
      <h2>Auth Status</h2>
      <div v-if="user.loggedIn">
        <p>Logged in as: <strong>{{ user.name || user.email }}</strong></p>
        <p>Roles: {{ user.roles.length ? user.roles.join(', ') : '(none)' }}</p>
        <button @click="logout()">
          Log out
        </button>
      </div>
      <div v-else>
        <p>Not logged in</p>
        <button @click="login()">
          Log in
        </button>
      </div>
    </section>

    <section style="margin-top: 2rem;">
      <h2>Session</h2>
      <button :disabled="sessionLoading" @click="fetchSession">
        {{ sessionLoading ? 'Loading...' : 'Fetch /auth/session' }}
      </button>
      <div v-if="sessionStatus" style="margin-top: 0.75rem;">
        <p>
          Status: <strong :style="{ color: sessionStatus >= 400 ? 'red' : 'green' }">{{ sessionStatus }}</strong>
        </p>
      </div>
      <pre
        v-if="sessionResult !== null"
        style="margin-top: 0.5rem; background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; max-height: 400px; overflow-y: auto;"
      >{{ sessionResult }}</pre>
    </section>

    <section style="margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem;">
      <h2>Debug: session simulation (dev only)</h2>
      <p style="color: #555;">
        Each button sets a <code>tlv2_debug_auth</code> cookie that a dev-only hook
        in <code>useAuth0Session</code> reads on the server (compiled out of
        production builds). The hook only ever <em>downgrades</em> a real session —
        it never fabricates a login — so log in first. Every button also clears the
        client re-auth guard (<code>tlv2_reauth_attempts</code>) and reloads, so
        each test starts fresh and the recovery flow runs on the next navigation.
      </p>
      <p>
        Current sim: <strong>{{ debugSim || '(off)' }}</strong> ·
        re-auth guard: <strong>{{ reauthGuard }}</strong>
      </p>

      <div style="margin-top: 1rem;">
        <button @click="setSim('degraded-once')">
          Degraded (recoverable)
        </button>
        <p style="color: #555; margin: 0.35rem 0 1.1rem;">
          Sets <code>tlv2_debug_auth=degraded-once</code>. The server returns your
          real user claims but with an <strong>empty access token</strong> — exactly
          as if <code>getAccessToken()</code> threw — and <strong>deletes the cookie
            on that read</strong>, so the next check is healthy again. Simulates a
          recoverable lapse: the client's recovery re-login round-trips auth0 and,
          with the SSO session still alive, comes back with a real token. You should
          end up logged in with roles — silent recovery.
        </p>

        <button @click="setSim('degraded')">
          Degraded (sticky → local logout)
        </button>
        <p style="color: #555; margin: 0.35rem 0 1.1rem;">
          Sets <code>tlv2_debug_auth=degraded</code> and <strong>leaves it set</strong>.
          Every <code>/auth/session</code> read returns your claims with an empty
          access token until you clear it. Simulates a dead refresh token that
          <em>can't</em> recover: the recovery re-login returns still degraded, so on
          the second pass the client falls back to a <strong>local logout</strong>
          (clears the <code>__a0_session</code> cookie, keeps the auth0 SSO session).
          You end up logged out on <code>/</code>. Click "Healthy" before logging
          back in, or the sticky cookie re-degrades you immediately.
        </p>

        <button @click="setSim('anonymous')">
          Anonymous
        </button>
        <p style="color: #555; margin: 0.35rem 0 1.1rem;">
          Sets <code>tlv2_debug_auth=anonymous</code>. The server reports
          <strong>no session at all</strong>, ignoring your real session cookie.
          Simulates a fully signed-out user server-side (no recovery — there was
          never a token to lose).
        </p>

        <button @click="setSim('')">
          Healthy (clear)
        </button>
        <p style="color: #555; margin: 0.35rem 0 0;">
          Deletes the <code>tlv2_debug_auth</code> cookie. Restores normal behavior:
          real access token and role enrichment from the <code>me</code> query.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUser, useLogin, useLogout } from '#imports'

const user = useUser()
const login = () => useLogin(null)
const logout = () => useLogout()

const debugSim = ref('')
const reauthGuard = ref('')

function readCookie (name: string): string {
  for (const part of document.cookie.split(/;\s*/)) {
    if (part.startsWith(`${name}=`)) {
      return part.slice(name.length + 1)
    }
  }
  return ''
}

function setSim (v: string) {
  document.cookie = v
    ? `tlv2_debug_auth=${v}; path=/`
    : 'tlv2_debug_auth=; path=/; max-age=0'
  sessionStorage.removeItem('tlv2_reauth_attempts')
  window.location.reload()
}

onMounted(() => {
  debugSim.value = readCookie('tlv2_debug_auth')
  reauthGuard.value = sessionStorage.getItem('tlv2_reauth_attempts') || '(none)'
})

const sessionResult = ref<string | null>(null)
const sessionStatus = ref<number | null>(null)
const sessionLoading = ref(false)

async function fetchSession () {
  sessionLoading.value = true
  sessionResult.value = null
  sessionStatus.value = null
  try {
    const response = await fetch('/auth/session')
    sessionStatus.value = response.status
    const text = await response.text()
    try {
      sessionResult.value = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      sessionResult.value = text
    }
  } catch (e: any) {
    sessionResult.value = `Fetch error: ${e.message}`
  } finally {
    sessionLoading.value = false
  }
}
</script>
