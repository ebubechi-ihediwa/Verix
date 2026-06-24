-- Sprint 4: SDK gateway agent config (additive, backwards compatible)
-- Adds Specialist.config (JSONB) to hold the project-scoped agent envelope
-- { name, settings } for agents created via /api/v1/agents. The Specialist.name
-- column remains a globally-unique internal sentinel; the developer-facing name
-- lives in config.name. No drops or renames.

-- AlterTable
ALTER TABLE "Specialist" ADD COLUMN "config" JSONB;
