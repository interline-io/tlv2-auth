<template>
  <div style="padding: 2rem;">
    <h1>tlv2-auth Playground</h1>

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
  </div>
</template>

<script setup lang="ts">
import { useUser, useLogin, useLogout } from '#imports'

const user = useUser()
const login = () => useLogin(null)
const logout = () => useLogout()
</script>
