# Nyanga Beauty & Spa — imagen de producción
# Node 24 trae SQLite integrado (node:sqlite), no hace falta nada más.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=5500 \
    DB_PATH=/app/data/nyanga.db \
    OUTBOX_DIR=/app/data/outbox

WORKDIR /app

# Dependencias primero (se cachean si no cambia package*.json)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Código
COPY server ./server
COPY public ./public
COPY admin ./admin

# Carpeta de datos (base de datos y correos de prueba) → montar un volumen aquí
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 5500

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
