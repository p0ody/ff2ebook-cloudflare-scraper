export const Config = {
	App: {
		LISTENING_PORT: 	4000,
	},
	ScraperMgr: {
		MAX_ASYNC_PAGE:		3,
		LOOP_INTERVAL_MS:	500,
		PUPPETEER_HEADLESS:	false,
		SLOWDOWN_MS:		2000, // Added to slow down puppeteer to reduce the change of getting blocked
		PROXY_URL:			"",		// Include protocol (http://, https://...)
		PROXY_AUTH:			{
			username: "",
			password: "",
		},
		BROWSER_LIFE_SEC:	120,
	}

};
