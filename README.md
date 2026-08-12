# kjarni

Internal platform backend for running multiple Slökkvitæki / Brunahólf sites and apps.

Scaffolded from [NextBase](https://github.com/imbhargav5/nextbase-nextjs-supabase-starter)
— Next.js 16 · Supabase · Turborepo · TypeScript · Tailwind · shadcn/ui.

## The idea
One codebase, many sites. Each website/app lives under `apps/`; shared tools,
UI, auth and data helpers live under `packages/`. Build a tool once → any site
can switch it on.

## Status
Foundation spike. First target site: **Slökkvitæki product store + intro page**.

## Getting started
```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase keys
pnpm dev
```

Inherits the NextBase conventions in `docs/` and `AGENTS.md`.
