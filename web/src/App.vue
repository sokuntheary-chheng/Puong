<script setup lang="ts">
/**
 * Application shell: a header that identifies the tree you are in, and the
 * routed screen below it. Nothing here reads the store — the shell must
 * render before anything has loaded, so it holds no async state of its own.
 */
</script>

<template>
  <div class="shell">
    <header class="shell__bar">
      <RouterLink
        to="/"
        class="shell__brand"
      >
        Puong
      </RouterLink>
      <nav
        class="shell__nav"
        aria-label="Main"
      >
        <RouterLink to="/">
          My trees
        </RouterLink>
        <RouterLink to="/login">
          Log in
        </RouterLink>
      </nav>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--puong-rule, #d8d2c6);
  background: var(--puong-surface, #fffdf8);
}

.shell__brand {
  font-weight: 700;
  letter-spacing: 0.01em;
}

.shell__nav {
  display: flex;
  gap: 1rem;
  font-size: 0.95rem;
}

/* The route the user is on is the one piece of navigation state the shell
   owns; vue-router's active class is enough for it. */
.shell__nav a[aria-current='page'] {
  font-weight: 600;
  text-decoration: none;
}

.shell__main {
  flex: 1;
  padding: 1.5rem 1.25rem 3rem;
  max-width: 62rem;
  width: 100%;
  margin: 0 auto;
}
</style>
