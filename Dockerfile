FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build:client
ENV PORT=8787 HOST=0.0.0.0 SPATIAL_DATA_DIR=/data STATIC_DIR=/app/client
EXPOSE 8787
CMD ["npx", "tsx", "server/server.ts"]