FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --legacy-peer-deps

COPY backend/package*.json ./backend/
COPY backend/prisma ./backend/prisma
RUN cd backend && npm install --legacy-peer-deps --include=dev

COPY . .
RUN npm run prisma:generate
RUN cd frontend && npm run build

EXPOSE 8080

CMD ["npm", "start"]
