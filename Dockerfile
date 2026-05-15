FROM joseluisq/static-web-server:2
ENV SERVER_PORT=8000
ENV CACHE_CONTROL="public, max-age=3600, s-maxage=86400"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8000/ || exit 1
COPY landing/ /public/
COPY web/ /public/app/
COPY CNAME /public/CNAME
COPY privacy.html /public/privacy.html
COPY terms.html /public/terms.html
COPY refund.html /public/refund.html
COPY contact.html /public/contact.html
COPY dashboard.html /public/dashboard.html
