# One small image for the dependency-free local fakes. Build arg FAKE picks the server.
FROM node:24-alpine
ARG FAKE
WORKDIR /app
COPY ${FAKE}/server.mjs ./server.mjs
USER node
CMD ["node", "server.mjs"]
