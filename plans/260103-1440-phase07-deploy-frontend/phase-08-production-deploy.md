# Phase 8: Production Deploy

**Priority**: P1 | **Effort**: 3h | **Status**: pending

## Context Links

- [Research: Deploy Patterns](./research/researcher-02-deploy-patterns.md)
- Docker config: `docker/docker-compose.yml`
- API Dockerfile: `docker/Dockerfile.api`
- Web Dockerfile: `docker/Dockerfile.web`
- VPS: `38.242.154.189` (ssh vps)

## Overview

Deploy NativeHub 3.0 to VPS with zero-downtime using existing Docker + Traefik setup. Verify health checks, SSL certs, and graceful shutdown work correctly in production.

## Key Insights from Research

1. Current Dockerfiles are functional but not optimized (no turbo prune)
2. Health check already configured in docker-compose.yml
3. Traefik labels already set for `api.nativehub.arakakileo.com` and `nativehub.arakakileo.com`
4. Graceful shutdown handler added in Phase 7 - verify it works
5. Docker Rollout plugin enables zero-downtime deploys

## Requirements

| Requirement | Description |
|-------------|-------------|
| REQ-8.1 | Optimize Dockerfile.api with turbo prune (optional, existing works) |
| REQ-8.2 | Add graceful shutdown verification in Docker CMD |
| REQ-8.3 | Install Docker Rollout plugin on VPS |
| REQ-8.4 | Deploy API and Web services |
| REQ-8.5 | Verify health checks work (`/health` returns 200) |
| REQ-8.6 | Verify SSL certs work (Let's Encrypt via Traefik) |
| REQ-8.7 | Document deployment process |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   VPS (38.242.154.189)                  │
├─────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐ │
│  │                    Traefik                         │ │
│  │  :80 (redirect) / :443 (SSL via Let's Encrypt)    │ │
│  └──────────────────┬───────────────┬─────────────────┘ │
│                     │               │                   │
│     ┌───────────────▼───┐   ┌───────▼───────────────┐  │
│     │ api.nativehub.*   │   │ nativehub.arakakileo.* │  │
│     │   nativehub-api   │   │    nativehub-web      │  │
│     │     :3001         │   │       :80 (nginx)     │  │
│     └───────────────────┘   └───────────────────────┘  │
│                     │                                   │
│     ┌───────────────▼───────────────────────────────┐  │
│     │           PostgreSQL (Supabase)               │  │
│     │        supabase.arakakileo.com                │  │
│     └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Related Code Files

| File | Action |
|------|--------|
| `docker/Dockerfile.api` | UPDATE (verify CMD uses node directly) |
| `docker/docker-compose.yml` | REVIEW (already configured) |
| `docker/nginx.conf` | REVIEW (SPA routing) |
| `.env.production` | CREATE (production env vars template) |
| `scripts/deploy.sh` | CREATE (deployment script) |

## Implementation Steps

### Step 1: Verify Dockerfile.api CMD

Current Dockerfile uses `CMD ["node", "apps/api/dist/index.js"]` - correct for SIGTERM handling.

No changes needed. Verify the current file:

```dockerfile
# docker/Dockerfile.api (existing - verify these lines)
FROM node:20-alpine AS runner
# ...
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]  # Correct - receives SIGTERM
```

### Step 2: Create Production Environment Template

**File**: `.env.production.example`

```bash
# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@supabase.arakakileo.com:5432/postgres

# Auth
ENCRYPTION_KEY=[32-byte-hex-key]
BETTER_AUTH_SECRET=[random-secret]
BETTER_AUTH_URL=https://api.nativehub.arakakileo.com
FRONTEND_URL=https://nativehub.arakakileo.com

# Node
NODE_ENV=production
PORT=3001
```

### Step 3: Create Deployment Script

**File**: `scripts/deploy.sh`

```bash
#!/bin/bash
set -e

# NativeHub 3.0 Production Deployment Script
# Usage: ./scripts/deploy.sh [api|web|all]

DEPLOY_TARGET="${1:-all}"
COMPOSE_FILE="docker/docker-compose.yml"
PROJECT_DIR="/opt/nativehub"

echo "=== NativeHub 3.0 Deployment ==="
echo "Target: $DEPLOY_TARGET"
echo "Date: $(date)"

# Check if running on VPS
if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Not running on VPS (missing $PROJECT_DIR)"
  exit 1
fi

cd "$PROJECT_DIR"

# Pull latest code
echo "==> Pulling latest code..."
git pull origin main

# Build images
echo "==> Building Docker images..."
if [ "$DEPLOY_TARGET" = "api" ] || [ "$DEPLOY_TARGET" = "all" ]; then
  docker compose -f "$COMPOSE_FILE" build api
fi

if [ "$DEPLOY_TARGET" = "web" ] || [ "$DEPLOY_TARGET" = "all" ]; then
  docker compose -f "$COMPOSE_FILE" build web
fi

# Deploy with zero-downtime (using Docker Rollout if installed)
echo "==> Deploying services..."
if command -v docker-rollout &> /dev/null; then
  # Use Docker Rollout for zero-downtime
  if [ "$DEPLOY_TARGET" = "api" ] || [ "$DEPLOY_TARGET" = "all" ]; then
    docker rollout -f "$COMPOSE_FILE" api
  fi
  if [ "$DEPLOY_TARGET" = "web" ] || [ "$DEPLOY_TARGET" = "all" ]; then
    docker rollout -f "$COMPOSE_FILE" web
  fi
else
  # Fallback: standard docker compose up
  echo "Warning: docker-rollout not installed, using standard deployment"
  docker compose -f "$COMPOSE_FILE" up -d $DEPLOY_TARGET
fi

# Wait for health checks
echo "==> Waiting for health checks..."
sleep 10

# Verify deployment
echo "==> Verifying deployment..."
if [ "$DEPLOY_TARGET" = "api" ] || [ "$DEPLOY_TARGET" = "all" ]; then
  API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://api.nativehub.arakakileo.com/health || echo "failed")
  if [ "$API_HEALTH" = "200" ]; then
    echo "API health check: PASSED"
  else
    echo "API health check: FAILED (status: $API_HEALTH)"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 api
    exit 1
  fi
fi

if [ "$DEPLOY_TARGET" = "web" ] || [ "$DEPLOY_TARGET" = "all" ]; then
  WEB_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://nativehub.arakakileo.com || echo "failed")
  if [ "$WEB_HEALTH" = "200" ]; then
    echo "Web health check: PASSED"
  else
    echo "Web health check: FAILED (status: $WEB_HEALTH)"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 web
    exit 1
  fi
fi

# Cleanup old images
echo "==> Cleaning up old images..."
docker image prune -f

echo "=== Deployment Complete ==="
echo "API: https://api.nativehub.arakakileo.com"
echo "Web: https://nativehub.arakakileo.com"
```

### Step 4: Install Docker Rollout on VPS

```bash
# SSH to VPS
ssh vps

# Create CLI plugins directory
mkdir -p ~/.docker/cli-plugins

# Download docker-rollout
curl -L https://raw.githubusercontent.com/wowu/docker-rollout/main/docker-rollout \
  -o ~/.docker/cli-plugins/docker-rollout

# Make executable
chmod +x ~/.docker/cli-plugins/docker-rollout

# Verify installation
docker rollout --help
```

### Step 5: Initial Deployment Commands

```bash
# SSH to VPS
ssh vps

# Clone/update repository
cd /opt
git clone https://github.com/your-repo/nativehub-3.git nativehub 2>/dev/null || true
cd nativehub
git pull origin main

# Create .env from template
cp .env.production.example .env
nano .env  # Edit with actual values

# Verify Traefik network exists
docker network ls | grep traefik-public || docker network create traefik-public

# Build and deploy
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d

# Check logs
docker compose -f docker/docker-compose.yml logs -f api
```

### Step 6: Verify Health Checks

```bash
# Test API health
curl -i https://api.nativehub.arakakileo.com/health
# Expected: {"status":"ok","database":"connected","version":"3.0.0"}

# Test graceful shutdown
docker compose -f docker/docker-compose.yml stop -t 30 api
# Check logs for "Shutdown complete" message

# Test SSL certificate
openssl s_client -connect api.nativehub.arakakileo.com:443 -servername api.nativehub.arakakileo.com < /dev/null 2>/dev/null | openssl x509 -noout -dates
# Verify: notAfter should be ~90 days in future
```

### Step 7: Update nginx.conf for SPA Routing

**File**: `docker/nginx.conf` (verify exists)

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check for Traefik
    location /health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
```

## Todo List

- [ ] Verify Dockerfile.api uses `node` directly (not npm)
- [ ] Create `.env.production.example` template
- [ ] Create `scripts/deploy.sh` deployment script
- [ ] SSH to VPS and install Docker Rollout plugin
- [ ] Clone repository to VPS `/opt/nativehub`
- [ ] Create `.env` with production values
- [ ] Verify traefik-public network exists
- [ ] Build and deploy Docker images
- [ ] Verify API health check returns 200
- [ ] Verify Web serves correctly
- [ ] Verify SSL certificates valid
- [ ] Test graceful shutdown (SIGTERM handling)
- [ ] Document rollback procedure

## Success Criteria

1. **API accessible**: `https://api.nativehub.arakakileo.com/health` returns 200
2. **Web accessible**: `https://nativehub.arakakileo.com` loads React app
3. **SSL valid**: Certificates auto-provisioned via Let's Encrypt
4. **Zero downtime**: Rollout deploys don't interrupt existing requests
5. **Graceful shutdown**: Logs show "Shutdown complete" on restart
6. **Jobs running**: pg-boss jobs visible in database tables

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSL cert fails | Low | High | Check DNS propagation, verify Traefik ACME config |
| Database connection fails | Low | High | Verify DATABASE_URL, check Supabase firewall |
| Port conflict | Low | Medium | Check no other services on 3001/80 |
| Docker build fails | Medium | Medium | Test build locally first |
| Memory exhaustion | Low | High | Monitor with `docker stats` |

## Security Considerations

- Never commit `.env` to git (only `.env.production.example`)
- Use Docker secrets for sensitive values (future improvement)
- Verify HTTPS redirect works (HTTP -> HTTPS)
- Check security headers in response (X-Frame-Options, etc.)

## Rollback Procedure

```bash
# If deployment fails, rollback to previous image
ssh vps
cd /opt/nativehub

# View available images
docker images | grep nativehub

# Rollback to specific tag
docker compose -f docker/docker-compose.yml up -d --no-build

# Or restore from previous commit
git checkout HEAD~1
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

## Monitoring Commands

```bash
# View live logs
docker compose -f docker/docker-compose.yml logs -f api

# Check container status
docker compose -f docker/docker-compose.yml ps

# View resource usage
docker stats

# Check pg-boss jobs
docker compose -f docker/docker-compose.yml exec api node -e "
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect().then(() =>
    client.query('SELECT name, state, createdon FROM pgboss.job ORDER BY createdon DESC LIMIT 10')
  ).then(r => console.table(r.rows)).finally(() => client.end());
"
```

## Next Steps

After successful deployment:
1. Monitor logs for first 30 minutes
2. Verify scheduled jobs run (check pgboss.job table)
3. Proceed to Phase 9 (Frontend Dashboard)
