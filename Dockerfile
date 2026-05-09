FROM joseluisq/static-web-server:2
ENV SERVER_PORT=8000
EXPOSE 8000
COPY . /public
