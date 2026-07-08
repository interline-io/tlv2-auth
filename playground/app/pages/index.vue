<template>
  <div style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1>tlv2-auth Playground</h1>
    <p>
      Home (<code>/</code>) — a deliberately bare landing page, so a redirect here
      (from recovery, logout, or a declined login) is obvious in the address bar.
    </p>
    <p>Logged in: <strong>{{ user.loggedIn ? 'yes' : 'no' }}</strong></p>
    <nav style="margin-top: 1rem;">
      <NuxtLink to="/session">
        Session &amp; auth debug
      </NuxtLink>
      <NuxtLink to="/fetch" style="margin-left: 1rem;">
        Vanilla fetch
      </NuxtLink>
      <NuxtLink to="/apollo" style="margin-left: 1rem;">
        Apollo
      </NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useUser } from '#imports'

const user = useUser()
</script>
