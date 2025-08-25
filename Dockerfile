# Node.js app for Cloud Run
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies separately for better caching
FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cloud Run listens on $PORT
EXPOSE 8080
CMD ["node", "src/server.js"]
