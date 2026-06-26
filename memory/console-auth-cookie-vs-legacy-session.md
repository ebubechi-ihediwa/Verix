---
name: console-auth-cookie-vs-legacy-session
description: Why the developer console uses lib/console-client.ts instead of lib/api-client.ts
metadata:
  type: project
---

The developer console (auth + projects UI, Sprint 3) talks to the API through
`src/lib/console-client.ts`, NOT `src/lib/api-client.ts`.

**Why:** `api-client.authedRequest` injects an `x-session-id` header sourced from
`/api/session` (an anonymous session in localStorage). Server-side `getSessionId`
reads that header *before* the `asn_session` cookie, so the anonymous id shadows
the real authenticated cookie session → project routes return 401. `console-client`
deliberately sends NO `x-session-id` and relies on the httpOnly cookie (included
automatically on same-origin fetch with `credentials: "same-origin"`).

**How to apply:** Any new authenticated console/dashboard data call goes in
`console-client.ts`. Do not route console UI through `api-client.ts`. The two
session models (legacy anonymous header vs. cookie auth) still need reconciliation —
relevant when building the Sprint 4 SDK gateway / `/api/v1`.
