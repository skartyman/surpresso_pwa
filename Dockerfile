FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com/ \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-factor 10 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm install --legacy-peer-deps

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --legacy-peer-deps

COPY backend/package*.json ./backend/
COPY backend/prisma ./backend/prisma
RUN cd backend && npm install --legacy-peer-deps --include=dev

COPY . .
RUN cd backend && npx prisma generate --config prisma.config.ts
RUN cd frontend && npm run build

EXPOSE 8080

CMD ["npm", "start"]
