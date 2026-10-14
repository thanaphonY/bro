
FROM nginx:alpine

COPY generate-config.sh /docker-entrypoint.d/40-generate-config.sh

RUN chmod +x /docker-entrypoint.d/40-generate-config.sh
