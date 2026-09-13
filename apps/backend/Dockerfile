# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build
RUN npm run db:generate

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
