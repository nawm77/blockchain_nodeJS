FROM node:14
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
EXPOSE 3001 3002 6001
CMD [ "node", "main.js" ]
