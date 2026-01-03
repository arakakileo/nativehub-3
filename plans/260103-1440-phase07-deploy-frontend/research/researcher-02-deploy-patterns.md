# Research: Production Deployment Patterns for Node.js Monorepo + Docker + Traefik

**Date:** 2026-01-03 | **Status:** Complete | **Scope:** NativeHub 3.0 VPS Deployment

---

## Executive Summary

Node.js monorepo deployments with Docker require multi-stage builds to optimize image size and build caching. Traefik provides declarative Docker label-based routing with automatic SSL via Let's Encrypt. Zero-downtime deployments demand graceful shutdown handling (SIGTERM), health checks, and either Docker Rollout plugin or Traefik-based rolling updates. Secrets must use Docker Secrets or file-based mounting, never environment variables for sensitive data.

---

## Key Findings

### 1. Docker Multi-Stage Builds for Monorepos

**Turborepo `turbo prune` Strategy (Recommended)**
- Solves cascading redeployments when monorepo dependencies change
- Creates pruned workspace in `./out` with only required packages + lockfile
- Dramatically reduces Docker image rebuild footprint

**Pattern for NativeHub:**
```dockerfile
# Stage 1: Prune dependencies
FROM node:18-alpine AS pruner
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY . .
RUN npm install -g pnpm turbo
RUN turbo prune --scope=@nativehub/api --docker

# Stage 2: Build dependencies
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=pruner /app/out/json ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod=false

# Stage 3: Build application
COPY --from=pruner /app/out/full ./
RUN pnpm run build --filter=@nativehub/api

# Stage 4: Production runtime
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Key Points:**
- Prune + install removes unrelated packages (avoiding entire rebuild on any dependency change)
- Production stage only includes built code + node_modules (no build tools)
- Layers cached separately = faster rebuilds

### 2. Traefik Label Configuration for SSL + Routing

**Essential Labels for NativeHub Services:**
```yaml
services:
  api:
    image: nativehub:api
    networks:
      - traefik-public
    labels:
      # Service discovery
      traefik.enable: "true"
      traefik.docker.network: traefik-public

      # HTTP routing
      traefik.http.routers.api-http.rule: "Host(`api.arakakileo.com`)"
      traefik.http.routers.api-http.entrypoints: "web"
      traefik.http.routers.api-http.middlewares: "redirect-to-https"

      # HTTPS routing (auto-redirect via middleware)
      traefik.http.routers.api-https.rule: "Host(`api.arakakileo.com`)"
      traefik.http.routers.api-https.entrypoints: "websecure"
      traefik.http.routers.api-https.tls: "true"
      traefik.http.routers.api-https.tls.certresolver: "letsencrypt"

      # Load balancer service
      traefik.http.services.api-service.loadbalancer.server.port: "3000"

      # Security headers middleware
      traefik.http.middlewares.secure-headers.headers.frameDeny: "true"
      traefik.http.middlewares.secure-headers.headers.sslRedirect: "true"
      traefik.http.middlewares.secure-headers.headers.browserXssFilter: "true"
      traefik.http.middlewares.secure-headers.headers.contentTypeNosniff: "true"
      traefik.http.middlewares.secure-headers.headers.stsSeconds: "31536000"
      traefik.http.middlewares.secure-headers.headers.stsIncludeSubdomains: "true"
      traefik.http.middlewares.secure-headers.headers.stsPreload: "true"

      # HTTP→HTTPS redirect
      traefik.http.middlewares.redirect-to-https.redirectscheme.scheme: "https"
      traefik.http.middlewares.redirect-to-https.redirectscheme.permanent: "true"

      # Apply security headers to HTTPS router
      traefik.http.routers.api-https.middlewares: "secure-headers"
```

**TLS Configuration Notes:**
- Minimum TLS 1.2 enforced by default (don't override unless required)
- Let's Encrypt certificates stored in `acme.json` (backup regularly)
- Custom TLS ciphers configured via `traefik.yml`, not Docker labels

### 3. Health Checks + Graceful Shutdown

**Docker SIGTERM → Node.js Shutdown Pattern:**
```javascript
// app.js (Hono/Express)
const server = app.listen(3000, () => console.log('Server started'));

let isShuttingDown = false;

// Health endpoint (readiness probe)
app.get('/health', (c) => {
  if (isShuttingDown) return c.json({ status: 'shutting_down' }, 503);
  return c.json({ status: 'ok' });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown...');
  isShuttingDown = true;

  // Stop accepting new requests (via readiness check)
  // Wait max 30s for existing requests to complete
  setTimeout(() => {
    console.log('Force shutdown timeout reached');
    process.exit(1);
  }, 30000);

  server.close(async () => {
    // Clean up resources
    if (db) await db.close();
    console.log('Server closed gracefully');
    process.exit(0);
  });
});
```

**Docker Health Check:**
```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
```

**Critical Rules:**
- Use `node` directly in CMD, NOT `npm start` (npm doesn't forward SIGTERM)
- Readiness endpoint must return 500/503 during shutdown
- Docker waits 10s default, Kubernetes allows 30s grace period
- Test graceful shutdown locally: `docker stop -t 30 <container>`

### 4. Environment Variable Management (Production)

**Secrets Pattern:**
```yaml
# docker-compose.yml
services:
  api:
    environment:
      DB_HOST: postgres.internal
      DB_PASSWORD_FILE: /run/secrets/db_password
      JWT_SECRET_FILE: /run/secrets/jwt_secret
    secrets:
      - db_password
      - jwt_secret

secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    external: true  # Managed by Docker/Swarm
```

**Node.js Secret Loading:**
```javascript
import fs from 'fs';

const loadSecret = (name) => {
  try {
    return fs.readFileSync(`/run/secrets/${name}`, 'utf8').trim();
  } catch {
    return process.env[name] || null;
  }
};

const config = {
  db: {
    host: process.env.DB_HOST,
    password: loadSecret('db_password'),
  },
  jwt: {
    secret: loadSecret('jwt_secret'),
  },
};
```

**Never Use:**
- Raw env vars for secrets (exposed in `docker inspect`, image history)
- Hardcoded secrets in Dockerfiles
- Secrets in docker-compose environment (use secrets block only)

### 5. Zero-Downtime Deployment Strategy

**Recommended: Docker Rollout Plugin**
```bash
# Installation
mkdir -p ~/.docker/cli-plugins
curl https://raw.githubusercontent.com/wowu/docker-rollout/main/docker-rollout \
  -o ~/.docker/cli-plugins/docker-rollout
chmod +x ~/.docker/cli-plugins/docker-rollout

# Deployment
docker rollout api  # Replaces 'docker compose up -d api'
```

**How it works:**
1. Scale service to 2x instances (new + old)
2. Wait for new container health check passing
3. Remove old container (Traefik routes traffic automatically)

**Alternative: Manual Rolling Update Script**
```bash
#!/bin/bash
SERVICE=$1
docker compose up -d --scale $SERVICE=2 $SERVICE
sleep 15  # Allow new container to start

# Verify health check passes
docker compose ps $SERVICE

# Remove old container (keep new one)
docker compose down --remove-orphans
```

**Traefik Integration:** Automatically routes to healthy containers via service discovery labels.

---

## Deployment Checklist for NativeHub 3.0

### Pre-Deployment
- [ ] Dockerfile multi-stage build optimized with `turbo prune`
- [ ] `.dockerignore` excludes node_modules, .git, dist, coverage
- [ ] Image built with: `docker build -t nativehub:api --build-arg SERVICE=api .`
- [ ] Health endpoint implemented (`GET /health`)
- [ ] Graceful shutdown handler in place (SIGTERM listener)
- [ ] Secrets created: `docker secret create db_password < ./secrets/db_password.txt`
- [ ] Traefik network exists: `docker network ls | grep traefik-public`

### Traefik Configuration
- [ ] acme.json file writable by Traefik (chmod 600)
- [ ] DNS A records configured: `api.arakakileo.com`, `app.arakakileo.com`
- [ ] Traefik HTTPS entrypoint configured (port 443)
- [ ] Let's Encrypt provider configured with email + ACME challenge method

### Docker Compose Labels
- [ ] All services have `traefik.enable: "true"` label
- [ ] Router rules match domains: `Host(api.arakakileo.com)`
- [ ] Load balancer port matches container port (3000 for Hono)
- [ ] Middlewares applied: `secure-headers`, `redirect-to-https`
- [ ] TLS enabled on https routers: `traefik.http.routers.{name}.tls: "true"`

### Security
- [ ] Secrets not in environment variables
- [ ] Docker secrets used for: DB_PASSWORD, JWT_SECRET, API_KEYS
- [ ] Health check credentials (if any) not logged
- [ ] No hardcoded credentials in images
- [ ] TLS minimum version 1.2+ (verify in traefik.yml)

### Zero-Downtime Readiness
- [ ] Application is stateless (no in-memory session storage)
- [ ] Database connection pooling configured
- [ ] Health check timeout < 30 seconds
- [ ] Docker Rollout plugin installed OR manual rolling update script ready
- [ ] Tested locally: `docker stop -t 30 <container>` returns gracefully

### Monitoring
- [ ] Traefik logs monitored for routing errors
- [ ] Container restart policy: `restart: unless-stopped` (not `always`)
- [ ] Health check failures trigger alerts
- [ ] SIGTERM handling verified in logs during deployment
- [ ] Zero-downtime test: Deploy while simulating load (`ab` or `k6`)

---

## Common Pitfalls + Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| SIGTERM not received | Using `npm start` | Switch to `CMD ["node", "dist/index.js"]` |
| Cascading redeployments | No dependency pruning | Use `turbo prune` in Dockerfile |
| Downtime during updates | No rolling updates | Install Docker Rollout or scale to 2 instances |
| SSL certificate generation fails | Wrong ACME challenge setup | Verify DNS propagation, check traefik logs |
| Secrets exposed in logs | Logged full object | Use loadSecret() with `.trim()`, avoid logging values |
| Health check always fails | Wrong port/endpoint | Match health check port to container port (3000) |

---

## References

### Official Documentation
- [Turborepo Docker Guide](https://turborepo.com/docs/guides/tools/docker)
- [Traefik Docker Provider](https://doc.traefik.io/traefik/expose/docker/)
- [Traefik TLS Configuration](https://doc.traefik.io/traefik/https/tls/)
- [Node.js Graceful Shutdown Best Practices](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md)
- [Express Health Checks + Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- [Docker Secrets Management](https://docs.docker.com/engine/swarm/secrets/)

### Recommended Implementations
- [Docker Rollout Plugin](https://github.com/wowu/docker-rollout)
- [Docker Compose Zero-Downtime Pattern](https://github.com/vincetse/docker-compose-zero-downtime-deployment)
- [Terminus Library (Graceful Shutdown)](https://github.com/godaddy/terminus)

### Research Sources
- Multi-stage builds: [Medium - FintLabs](https://fintlabs.medium.com/optimized-multi-stage-docker-builds-with-turborepo-and-pnpm-for-nodejs-microservices-in-a-monorepo-c686fdcf051f)
- Graceful shutdown: [RisingStack Engineering](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/)
- Zero-downtime deployment: [Virtualization Howto](https://www.virtualizationhowto.com/2025/06/docker-rollout-zero-downtime-deployments-for-docker-compose-made-simple/)
- Secrets management: [Node.js Security](https://www.nodejs-security.com/blog/do-not-use-secrets-in-environment-variables-and-here-is-how-to-do-it-better)

---

## Unresolved Questions

1. **acme.json backup strategy:** Should we backup Let's Encrypt certs to prevent rate-limiting on recreation?
2. **Database connection pooling:** Optimal pool size for Hono + PostgreSQL under rolling updates?
3. **Traefik monitoring:** Which metrics (request duration, error rates) should trigger alerts for degraded deployments?
4. **Blue-green vs rolling updates:** Would blue-green (two full environment copies) provide better safety than rolling updates for NativeHub?
