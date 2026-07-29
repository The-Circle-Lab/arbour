This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

**Developer setup**

Follow these steps to get a local development environment running quickly.

Prerequisites:

- Node.js 18+ and a package manager (`npm`, `yarn`, or `pnpm`).
- Docker (optional) or a local Postgres instance.

Install dependencies:

```bash
npm install
# or
pnpm install
# or
yarn install
```

Start local Postgres (Docker example):

```bash
docker run --name arbour-postgres -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=arbour -p 5432:5432 -d postgres:15
```

Create local secrets file for the app and migration runner:

```bash
cp secrets.example.json secrets.json
# edit secrets.json and set the "password" field to match your local Postgres
```

Generate a session secret for authentication and add it to `.env`:

```bash
openssl rand -base64 32
# add the output to .env as SESSION_SECRET=<value>
```

Apply database migrations before running the app:

```bash
# apply pending migrations
npm run migrate

# rollback last migration
npm run migrate:down
```

Run the app in development:

```bash
npm run dev
```

The app requires an account. Open http://localhost:3000/signup to create one before using the app.

Helpful commands:

```bash
# Build for production
npm run build

# Lint
npm run lint
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database migrations

This project includes a small TypeScript migration runner that applies SQL files from the `migrations/` directory and records applied migrations in node-pg-migrate's default `pgmigrations` table.

Quick local setup:

1. Copy the example secrets file and set your local DB password:

```bash
cp secrets.example.json secrets.json
# edit secrets.json and set the "password" field
```

2. Install dependencies (includes `ts-node` used by the runner):

```bash
npm install
```

3. Start a local Postgres (optional):

```bash
docker run --name arbour-postgres -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=arbour -p 5432:5432 -d postgres:15
# set secrets.json.password to "secret" or set DATABASE_URL
```

4. Apply migrations (the runner and app both read `secrets.json` when `DATABASE_URL` is not set):

```bash
# apply all pending migrations
npm run migrate

# rollback last applied migration
npm run migrate:down
```

5. Verify (example):

```bash
psql "$DATABASE_URL" -c "SELECT name, run_on FROM pgmigrations ORDER BY run_on;"
psql "$DATABASE_URL" -c "\d+ teams"
psql "$DATABASE_URL" -c "\d+ members"
```
