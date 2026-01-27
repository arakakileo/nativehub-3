# NativeHub 3.0

Native Ads Management Platform - Unified dashboard for managing campaigns across multiple traffic sources with automated optimization.

## Features

- **Multi-Source Support**: Revcontent, Taboola, Outbrain, MGID
- **Unified Dashboard**: View all campaigns in one place
- **Automated Optimization**: Hourly bid adjustments and widget blacklisting
- **Widget Blacklist**: Cross-source publisher blocking
- **Custom Rules**: Template-based and custom optimization rules

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Framer Motion
- **Backend**: Hono + Drizzle ORM
- **Database**: PostgreSQL (Supabase)
- **Jobs**: node-cron + pg-boss
- **Deploy**: Docker + GitHub Actions

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- npm

### Installation

```bash
# Install dependencies
npm install

# Build shared package
npm run build --workspace=packages/shared

# Set up environment
cp .env.example .env
# Edit .env with your database and API credentials
```

### Development

```bash
# Start all services
npm run dev

# Or start individually
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

### Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage --workspace=apps/api
```

### Build

```bash
# Build all
npm run build

# Build Docker images
docker compose -f docker/docker-compose.yml build
```

### Deploy

```bash
# Deploy with Docker Compose
docker compose -f docker/docker-compose.yml up -d
```

## Project Structure

```
nativehub-3/
├── apps/
│   ├── api/          # Hono backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared types and schemas
├── docker/           # Docker configuration
└── .github/
    └── workflows/    # CI/CD pipelines
```

## Environment Variables

See `.env.example` for required configuration.

## API Endpoints

- `GET /api/v1/source-accounts` - List connected accounts
- `POST /api/v1/source-accounts` - Connect new account
- `GET /api/v1/campaigns` - List all campaigns
- `GET /api/v1/optimizer/rules` - List optimization rules
- `POST /api/v1/optimizer/run` - Trigger manual optimization

## License

Private - All rights reserved
