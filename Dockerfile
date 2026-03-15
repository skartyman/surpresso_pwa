FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com/ \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-factor 10 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm install --legacy-peer-deps


COPY . .
RUN ls -la
RUN ls -la prisma
RUN npx prisma generate
RUN ls -la node_modules/.prisma/client || true

EXPOSE 8080

CMD ["npm", "start"]
