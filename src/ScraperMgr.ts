import Playwright from "playwright";
import Logger from "loglevel";

import { Config } from "./Config";
import * as Captcha from "./Captcha";


interface BrowserOptions {
	headless?: boolean,
	args?: Array<string>,
	userDataDir?: string,
	slowMo?: number,
	proxy? : { server: string, username: string, password: string },
	bypassCSP?: boolean,
	channel?: string,
	ignoreDefaultArgs?: boolean | Array<string>,
	viewport?: { width: number, height: number },
}

export class ScraperMgr {
	private options: BrowserOptions;
	private browser: Playwright.BrowserContext | null = null;
	private lastUse: number;
	private paused: boolean = false;
	private browserPaused: boolean = false;
	private pausedSince: number | null;
	private pageList: Array<{ startTime: number, page: Playwright.Page }> = [];

	constructor() {
		this.options = {
			headless: Config.ScraperMgr.PUPPETEER_HEADLESS,
			args:	["--no-sandbox",
					"--disable-session-crashed-bubble",
					"--disable-gpu",
					"--disable-blink-features=AutomationControlled",
					"--disable-setuid-sandbox"
			],
			bypassCSP: true,
			viewport: { width: 800, height: 600 },
		};
		if (Config.ScraperMgr.PROXY_URL.length > 0){
			this.options["proxy"] = {
				server: Config.ScraperMgr.PROXY_URL,
				username: Config.ScraperMgr.PROXY_AUTH.username,
				password: Config.ScraperMgr.PROXY_AUTH.password
			};
			this.options.args.push(`--proxy-server=${Config.ScraperMgr.PROXY_URL}`);
		}
		this.updateLastUsed();

		setInterval(async () => await this.browserLife(), 5000);
	}

	async getPage(url: string) {
		this.updateLastUsed();

		while (this.paused || this.browserPaused) {
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		}
		if (!this.isBrowserValid()) {
			if (!await this.startBrowser()) {
				Logger.error("Could not launch browser.");
				return null;
			}
		}
		if (!this.isBrowserValid()) {
			Logger.error("Browser not valid.");
			return null;
		}

		const page: Playwright.Page | null = await this.browser.newPage()
		.catch((err) => {
			Logger.error(`${err}`);
			return null;
		});

		if (!page) {
			Logger.error("Page not found");
			return null;
		}
		this.pageList.push({ startTime: Date.now(), page: page });

		let response: Playwright.Response | null = await page.goto(url, { timeout: Config.ScraperMgr.NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
		.catch((err) => {
			console.log("test");
			Logger.error(`${err}`);
			return null;
		});
		if (!response) {
			page.close();
			return null;
		}
		
		let responseBody = await response.text();
		
		let tryCount = 0;
		let wasVerificationPage = false;
		while (await this.isInBrowserVerification(page)) {
			wasVerificationPage = true;
			this.pause(true); // Pause to allow page to close and update cookies instead of letting multiple page wait for browser validation
			if (await Captcha.containCaptcha(page)) { // When we get a captcha, clear cookies.
				Logger.info("Captcha detected...");
				if (!await Captcha.handleCaptcha(page)) {
					await page.close();
					await this.clearCookies();
					return null;
				}
			}
			if (tryCount >= Config.ScraperMgr.MAX_RETRY) {
				page.close();
				this.pause(false);
				Logger.error("Timed out.");
				await this.clearCookies(); // When time out, clear cookie because it is likely caused by cloudflare
				return null;
			}
			await this.delay(Config.ScraperMgr.NAV_TIMEOUT_MS / Config.ScraperMgr.MAX_RETRY);
			tryCount++;
		}

		responseBody = await page.content();
		// Add a delay before closing page to slow down scraping.


		if (wasVerificationPage) { // Add a delay to let cookies update before opening a new page.
			await this.delay(1000);
		}

		this.delay(Config.ScraperMgr.SLOWDOWN_MS).then(() => {
			page.close();
		});
		this.pause(false);
		return responseBody;
	}

	private async isInBrowserVerification(page: Playwright.Page): Promise<boolean> {
		await page.waitForLoadState("domcontentloaded");
		const content = await page.content().catch(() => { return null });
		if (!content) {
			return true;
		}

		return (content.includes("challenge-error-title") 
		|| content.includes("cf-browser-verification") 
		|| content.includes("cf-spinner-redirecting") 
		|| content.includes("cf-challenge-body-text") 
		|| content.includes("challenge-running"));
	}


	private async clearCookies() {
		Logger.error("Clearing browser cookies...");
		await this.browser.clearCookies();
	}

	private async startBrowser() {
		while (this.browserPaused) { // If already paused, dont start a new browser to avoid starting multiple browser.
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		}

		if (this.isBrowserValid()) {
			return this.browser;
		}

		this.browser = null;
		this.pauseBrowser(true);
		this.browser = await Playwright.chromium.launchPersistentContext(`${__dirname}/userDataDir`, this.options)
		.catch((err) => {
			Logger.error(`Browser !!!!  ${err}`);
			this.pauseBrowser(false);
			return null;
		});
		await this.delay(500);

		if (!this.isBrowserValid()) {
			this.pauseBrowser(false);
			return false;
		}
		Logger.info("Browser started.");
		this.pauseBrowser(false);

		this.browser.on("close", async () => {
			Logger.error("Browser disconnected.");
		});
		this.updateLastUsed();
		return this.browser;
	}

	private async closeBrowser(): Promise<boolean> {
		if (!this.browser) {
			this.pauseBrowser(false);
			return true;
		}

		this.pauseBrowser(true);
		let pagesCount = 0;
		let timer = Date.now();
 		do  { // Wait for other requests to finish, wait maximum of 10 sec.
			const pages = this.browser.pages();
			pagesCount = pages.length;
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		} while (pagesCount > 1 && (Date.now() - timer) < 10000); 

		if (this.browser) {
			await this.browser.close()
			.catch((err) => {
				Logger.error(`${err}`);
			});
		}

		this.browser = null;

		this.pauseBrowser(false);
		return true;
	}

	private async delay(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Close browser if the browser has not been used in the last xx seconds. See Config.ScraperMgr.BROWSER_LIFE_SEC
	 * @returns void
	 */
	private async browserLife(): Promise<void> {
		if ((this.paused && this.pausedSince) && Date.now() - this.pausedSince > 10000) { // If paused for more than 10 sec, resume
			this.pause(false);
		}
		if (!this.isBrowserValid()) {
			return;
		}

		// Added this to close tabs that sometimes stays open.
		this.pageList = this.pageList.filter((row) => {
			if (Date.now() - row.startTime > Config.ScraperMgr.NAV_TIMEOUT_MS) {
				if (row.page) {
					row.page.close().catch((err) => {
						// Silent error when page object no longer exist.
					});
				}
				return false;
			}
			return true;
		});

		if (!this.isBrowserValid()) {
			return;
		}

		if ((Date.now() - this.lastUse)/1000 < Config.ScraperMgr.BROWSER_LIFE_SEC) {
			return;
		}
		let pages = this.browser.pages();
		if (pages.length <= 1) {
			Logger.info("Closing browser due to inactivity.");
			await this.closeBrowser();
		}
	}

	private async updateLastUsed() {
		this.lastUse = Date.now();
	}

	private pause(paused: boolean) {
		if (paused) {
			this.paused = true;
			this.pausedSince = Date.now();
			return;
		}

		this.paused = false;
		this.pausedSince = null;
	}

	private pauseBrowser(paused: boolean) {
		this.browserPaused = paused;
	}

	private async restartBrowser(): Promise<void> {
		await this.closeBrowser();
		await this.delay(2000);
		await this.startBrowser();
	}

	private isBrowserValid(): boolean {
		if (!this.browser) {
			return false;
		}

/* 		if (!this.browser.isConnected()) {
			return false;
		} */

/* 		if (this.browser.process().killed) {
			return false;
		} */

		return true;
	}

}
