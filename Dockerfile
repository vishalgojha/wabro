FROM joseluisq/static-web-server:2
ENV SERVER_PORT=8080
EXPOSE 8080
COPY . /public
