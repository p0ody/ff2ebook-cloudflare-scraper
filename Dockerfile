FROM node:18
FROM mcr.microsoft.com/playwright:v1.36.0-jammy
WORKDIR /app

RUN apt-get update && apt-get install curl gnupg xvfb -y \
  && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt-get update \
  && apt-get install google-chrome-stable -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

  
COPY ["package.json", "package-lock.json", "tsconfig.json", "./"]
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install
COPY . .
RUN npm run build

ENV DISPLAY=:99
CMD ["node", "dist/index.js"]
EXPOSE 3000