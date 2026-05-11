# Stage 1: Build the landing page (if using a bundler in future)
# For now, static HTML is served directly
FROM joseluisq/static-web-server:2 AS builder
ENV SERVER_PORT=8000
EXPOSE 8000
COPY landing/ /public/

# Stage 2: Production
FROM joseluisq/static-web-server:2
ENV SERVER_PORT=${PORT:-8000}
ENV CACHE_CONTROL="public, max-age=3600, s-maxage=86400"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:$PORT/ || exit 1
COPY landing/ /public/
COPY CNAME /public/CNAME 2>/dev/null || true
COPY privacy.html /public/privacy.html 2>/dev/null || true
COPY terms.html /public/terms.html 2>/dev/null || true
COPY refund.html /public/refund.html 2>/dev/null || true
COPY contact.html /public/contact.html 2>/dev/null || true
COPY dashboard.html /public/dashboard.html 2>/dev/null || true