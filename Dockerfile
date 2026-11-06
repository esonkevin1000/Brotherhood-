FROM node:24-slim
WORKDIR /app
COPY package.json server.js index.html app.js pos.html pos.js sw.js manifest.webmanifest icon-192.png icon-512.png ./
ENV PORT=8080 DB_FILE=/data/barber.db TZ=Asia/Manila
EXPOSE 8080
CMD ["node", "server.js"]
