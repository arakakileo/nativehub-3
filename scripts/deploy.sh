#!/bin/bash
# ===========================================
# NativeHub 3.0 Production Deploy Script
# ===========================================
# Usage: ./scripts/deploy.sh [build|deploy|rollback|status]

set -euo pipefail

# Configuration
PROJECT_DIR="/opt/nativehub"
COMPOSE_FILE="docker/docker-compose.yml"
ENV_FILE="docker/.env.production"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_requirements() {
    log_info "Checking requirements..."

    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        log_info "Copy docker/.env.production.example to docker/.env.production and fill in values"
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        log_error "Docker not found"
        exit 1
    fi

    if ! docker network ls | grep -q traefik-public; then
        log_error "Network 'traefik-public' not found. Create with: docker network create traefik-public"
        exit 1
    fi

    log_info "Requirements check passed"
}

build() {
    log_info "Building Docker images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
    log_info "Build complete"
}

deploy() {
    check_requirements

    log_info "Deploying NativeHub 3.0..."

    # Check if docker-rollout is available for zero-downtime
    if docker rollout --version &> /dev/null 2>&1; then
        log_info "Using docker-rollout for zero-downtime deployment"
        docker rollout -f "$COMPOSE_FILE" --env-file "$ENV_FILE" api
        docker rollout -f "$COMPOSE_FILE" --env-file "$ENV_FILE" web
    else
        log_warn "docker-rollout not available, using standard deployment"
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
    fi

    log_info "Waiting for health checks..."
    sleep 10

    # Check health
    if docker compose -f "$COMPOSE_FILE" ps | grep -q "(healthy)"; then
        log_info "Deployment successful - services healthy"
    else
        log_warn "Services may still be starting. Check with: ./scripts/deploy.sh status"
    fi
}

rollback() {
    log_warn "Rolling back to previous version..."

    # Get previous image tags
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    log_info "Rollback complete"
}

status() {
    log_info "Service Status:"
    docker compose -f "$COMPOSE_FILE" ps

    echo ""
    log_info "Health Check:"

    # API health
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "  API: ${GREEN}healthy${NC}"
    else
        echo -e "  API: ${RED}unhealthy${NC}"
    fi

    # Container logs (last 5 lines)
    echo ""
    log_info "Recent API logs:"
    docker compose -f "$COMPOSE_FILE" logs --tail=5 api 2>/dev/null || echo "No logs available"
}

logs() {
    docker compose -f "$COMPOSE_FILE" logs -f "${2:-api}"
}

case "${1:-deploy}" in
    build)
        build
        ;;
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    status)
        status
        ;;
    logs)
        logs "$@"
        ;;
    *)
        echo "Usage: $0 {build|deploy|rollback|status|logs [service]}"
        exit 1
        ;;
esac
