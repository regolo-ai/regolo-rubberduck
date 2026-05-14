# Build stage: compile CSS with Tailwind
FROM node:lts-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:css

# Runtime stage
FROM node:lts-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=build /app/public/style.css ./public/style.css
COPY public/index.html public/app.mjs public/particles.js ./public/
COPY server.mjs .
COPY src/ ./src/
EXPOSE 3000
CMD ["npm", "start"]
