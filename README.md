Simple node server to serve scraped url from website protected by Cloudflare.

This server use queue and max Async request to reduce the chance of getting blocked by Cloudflare.

Recommanded to use with a rotating proxy.

To install:
1. Clone repo
2. Edit src/Config.ts to your liking
3. npm install
4. npm run build
5. npm start

To use, simply request the url in a browser: http://your-ip:port/?url=URL to fetch
