FROM node:20-slim

WORKDIR /app

COPY . .

RUN npm install
RUN cd packages/database && npx prisma generate
RUN npm run build -w packages/database
RUN npm run build -w apps/api

EXPOSE 3000

CMD ["sh", "-c", "cd packages/database && npx prisma migrate deploy && cd /app && node apps/api/dist/main.js"]