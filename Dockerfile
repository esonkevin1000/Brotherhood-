FROM node:24-slim
WORKDIR /app
COPY package.json server.js index.html app.js ./
ENV PORT=8080 DB_FILE=/data/barber.db
EXPOSE 8080
CMD ["node", "server.js"]
