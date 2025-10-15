# Start from Node.js slim image
FROM node:20-bullseye-slim

# Set working directory
WORKDIR /app

# Install required system dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y \
    wget \ 
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# Copy only package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema early for client generation
COPY server/prisma ./server/prisma

# Generate Prisma client
RUN npx prisma generate --schema=server/prisma/schema.prisma

# Copy the rest of the application code
COPY . .

# ✅ Copy cookies folder explicitly
COPY server/cookies ./cookies

# Install server-specific dependencies if package.json exists
WORKDIR /app/server
RUN [ -f package.json ] && npm install || echo "No server-specific package.json found"

# Back to root
WORKDIR /app

# Expose your app’s port
EXPOSE 5000

# Start your server
CMD ["node", "server/src/index.js"]
