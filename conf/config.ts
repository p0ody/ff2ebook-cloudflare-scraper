export const Config = {
	App: {
		LISTENING_PORT:		3000,
	},
	ScraperMgr: {
		MAX_ASYNC_PAGE:		4,
		LOOP_INTERVAL_MS:	700,
		PUPPETEER_HEADLESS:	false,
		SLOWDOWN_MS:		1000, 	// Added to slow down puppeteer to reduce the change of getting blocked
		PROXY_URL:			"",		// Include protocol (http://, https://)
		PROXY_AUTH:			{
								username: "",
								password: "",
							},
		BROWSER_LIFE_SEC:	30,
		NAV_TIMEOUT_MS:		10000,
	}

};
