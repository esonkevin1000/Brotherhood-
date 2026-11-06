FROM node:24-slim
WORKDIR /app
COPY package.json server.js index.html app.js pos.html pos.js sw.js manifest.webmanifest icon-192.png icon-512.png assetlinks.json book.html book.js bh-api.js bh.html bh.js bh.webmanifest landing.html update.js inbox.js logo.png logo-sm.png membership-card.jpg apple-touch-icon.png ./
COPY site ./site
ENV PORT=8080 DB_FILE=/data/barber.db TZ=Asia/Manila
EXPOSE 8080
CMD ["node", "server.js"]
