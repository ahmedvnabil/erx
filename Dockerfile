FROM node:24-bookworm-slim AS builder

WORKDIR /build
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm ci && npm run build

FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="Egypt Research Commons" \
      org.opencontainers.image.description="Source-grounded research infrastructure for Egyptian public affairs" \
      org.opencontainers.image.source="https://github.com/ahmedvnabil/erx" \
      org.opencontainers.image.licenses="MIT" \
      io.modelcontextprotocol.server.name="io.github.ahmedvnabil/egypt-research"

ENV NODE_ENV=production \
    EGYPT_RESEARCH_DB=/data/research.db

RUN apt-get update && apt-get install --no-install-recommends -y \
      poppler-utils tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system app && adduser --system --ingroup app app
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /build/dist ./dist
COPY public ./public
COPY deploy ./deploy
RUN chmod 0555 /app/deploy/collect-and-index.sh

RUN mkdir -p /data /backups && chown -R app:app /data /backups
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/cli.js", "serve", "--host", "0.0.0.0", "--port", "8000"]
