export const Config = {
	App: {
		LISTENING_PORT:		3000,
	},
	ScraperMgr: {
		MAX_ASYNC_PAGE:		4,
		LOOP_INTERVAL_MS:	500,
		PUPPETEER_HEADLESS:	false,
		SLOWDOWN_MS:		700, 	// Added to slow down puppeteer to reduce the change of getting blocked
		PROXY_URL:			"http://p.webshare.io:80",		// Include protocol (http://, https://)
		PROXY_AUTH:			{
								username: "lzlskjlh-rotate",
								password: "16qbgwr84ivf",
							},
		BROWSER_LIFE_SEC:	30,
		NAV_TIMEOUT_MS:		10000,
		MAX_RETRY:			20,
	}

};
