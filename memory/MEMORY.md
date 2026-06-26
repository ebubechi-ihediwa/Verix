# Memory Index

- [Console auth: cookie vs legacy session](console-auth-cookie-vs-legacy-session.md) — console uses lib/console-client.ts (cookie auth), not api-client.ts (anonymous x-session-id shadows the cookie)
- [v1 Agent ↔ Specialist mapping](v1-agent-specialist-mapping.md) — SDK agents = project-scoped Specialist rows; display name in config.name (Specialist.name is global-unique sentinel)
