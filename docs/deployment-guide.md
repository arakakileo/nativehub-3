# NativeHub 3.0 Deployment Guide

## Overview

Production deployment using Docker + Traefik with HTTPS via Let's Encrypt.

**Domains:**
- Web: `nativehub.arakakileo.com`
- API: `api.nativehub.arakakileo.com`

---

## Prerequisites

1. VPS with Docker and Docker Compose installed
2. Traefik running with Let's Encrypt resolver
3. DNS A records pointing to VPS IP
4. GitHub repository secrets configured

---

## GitHub Secrets

| Secret | Description | How to Generate |
|--------|-------------|-----------------|
| `VPS_HOST` | VPS IP address | Your VPS IP (e.g., 38.242.154.189) |
| `VPS_SSH_KEY` | SSH private key | `ssh-keygen -t ed25519 -C "deploy@nativehub"` |

---

## Environment Variables

Copy `.env.example` to `.env` on the VPS and configure:

```bash
# Database (use Supabase pooler or local postgres)
DATABASE_URL=postgresql://user:pass@host:5432/nativehub

# Security - NEVER share or commit these
ENCRYPTION_KEY=$(openssl rand -hex 32)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)

# URLs
BETTER_AUTH_URL=https://api.nativehub.arakakileo.com
FRONTEND_URL=https://nativehub.arakakileo.com

# Production settings
NODE_ENV=production
LOG_LEVEL=info
```

---

## DNS Records

| Type | Name | Value |
|------|------|-------|
| A | nativehub.arakakileo.com | 38.242.154.189 |
| A | api.nativehub.arakakileo.com | 38.242.154.189 |

---

## Initial Deployment

```bash
# On VPS
cd /root
git clone https://github.com/your-repo/nativehub-3.git
cd nativehub-3

# Configure environment
cp .env.example .env
nano .env  # Edit with production values

# Create traefik network if not exists
docker network create traefik

# Deploy
docker compose -f docker/docker-compose.yml up -d --build
```

---

## Verify Deployment

```bash
# Health check
curl https://api.nativehub.arakakileo.com/health

# Expected response:
# {"status":"ok","timestamp":"...","version":"3.0.0","database":"connected"}
```

---

## Rollback Procedure

```bash
# On VPS
cd /root/nativehub-3

# Find last good commit
git log --oneline -5

# Revert
git reset --hard <commit-hash>

# Rebuild and restart
docker compose -f docker/docker-compose.yml up -d --build
```

---

## Logs

```bash
# View API logs
docker compose -f docker/docker-compose.yml logs -f api

# View web logs
docker compose -f docker/docker-compose.yml logs -f web
```

---

## Pre-deployment Checklist

- [ ] All tests pass (`npm test`)
- [ ] DNS records propagated
- [ ] Traefik running with letsencrypt resolver
- [ ] GitHub secrets configured
- [ ] `.env` file on VPS configured

## Post-deployment Checklist

- [ ] Health check passes
- [ ] HTTPS certificate valid
- [ ] Login works
- [ ] Campaign sync runs (check logs)
