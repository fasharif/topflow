FROM node:20-slim

# Install OpenSSL required by Prisma Engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root manifest files first to leverage layer caching for dependencies
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/api/package*.json ./apps/api/

RUN npm install

# Copy source code after dependencies are installed
COPY . .

# Generate Prisma Client and build workspace packages
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w packages/database
RUN npm run build -w apps/api

EXPOSE 3000

# Execute database migrations using Prisma 7 config and start NestJS API
CMD ["sh", "-c", "npx prisma migrate deploy --config packages/database/prisma.config.ts && node apps/api/dist/src/main.js"]