FROM node:24-slim
WORKDIR /app
COPY . .
ENV PORT=8787 HOST=0.0.0.0 SPATIAL_DATA_DIR=/data
EXPOSE 8787
CMD ["node", "server/server.js"]
