FROM node:24-slim
WORKDIR /app
COPY package.json server.js index.html app.js sw.js manifest.webmanifest icon-192.png icon-512.png assetlinks.json book.html book.js bh-api.js bh-push.js bh.html bh.js bh.webmanifest home.html bh-icon-192.png bh-icon-512.png bh-apple-touch.png bh-mark.png landing.html update.js inbox.js logo.png logo-sm.png membership-card.jpg apple-touch-icon.png ./
COPY site ./site
COPY src ./src
ENV PORT=8080 DB_FILE=/data/barber.db TZ=Asia/Manila
EXPOSE 8080
CMD ["node", "server.js"]
