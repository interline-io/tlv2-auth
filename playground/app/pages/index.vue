<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1>tlv2-auth Playground</h1>

    <p style="margin-top: 0.5rem;">
      <NuxtLink to="/fetch">
        Vanilla fetch test (SSR + client)
      </NuxtLink>
      <NuxtLink to="/apollo" style="margin-left: 1rem;">
        Apollo test (SSR + client)
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUser, useLogin, useLogout } from '#imports'

const user = useUser()
const login = () => useLogin(null)
const logout = () => useLogout()

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
