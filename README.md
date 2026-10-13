# AutoSpace

Campaign distribution tool for managing authorized social publishing workflows.

## Stack

- Next.js + TypeScript (`apps/web`)
- NestJS (`apps/api`)
- BullMQ worker (`apps/worker`)
- PostgreSQL + Prisma (`packages/database`)
- Redis for queues
- npm workspaces monorepo

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis with `docker compose up -d`.
3. Run `npm install`.
4. Run `npm run dev`.

## Scope

The project is designed for campaign orchestration, content preparation, scheduling, logging, and publishing through accounts/channels that the operator owns or is authorized to use.
