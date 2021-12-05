import Puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import Axios from "axios";
Puppeteer.use(StealthPlugin());
import Logger from "loglevel";
Logger.setLevel("debug");

import { Config } from '../conf/config';
import { Browser, Page, HTTPResponse } from "puppeteer";


interface BrowserOptions {
	headless?: boolean,
	args?: Array<string>,
	userDataDir?: string,
	slowMo?: number,
}

interface Headers  {
	"sec-ch-ua": string,
	"sec-ch-ua-mobile": string, 
	"sec-ch-ua-platform":string, 
	"upgrade-insecure-requests":string,
	"origin": string, 
	"content-type": string, 
	"user-agent": string, 
	"referer": string,
	"cookie": string,
	"accept": string,
	"upgrade-insecure-request": number
}

interface Cookie {
	name: string,
	value:string
}

export class ScraperMgr {
	private options: BrowserOptions;
	private browser: Browser | null = null;
	private lastUse: number;
	private paused: boolean = false;
	private browserPaused: boolean = false;
	private pausedSince: number | null;
	private pageList: Array<{ startTime: number, page: Page }> = [];
	constructor() {
		this.options = {
			headless: Config.ScraperMgr.PUPPETEER_HEADLESS,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
			userDataDir: "./userDataDir",
		};
		if (Config.ScraperMgr.PROXY_URL.length){
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

		const page: Page | null = await this.browser.newPage()
		.catch((err) => {
			Logger.error(`${err}`);
			return null;
		});
		if (!page) {
			console.log("Page not found");
			return null;
		}
		this.pageList.push({ startTime: Date.now(), page: page });

		if (Config.ScraperMgr.PROXY_AUTH.username) {
			await page.authenticate(Config.ScraperMgr.PROXY_AUTH)
			.catch((err) => {
				Logger.error(`${err}`);
			});
		}
	
		let response: HTTPResponse | null = await page.goto(url, { timeout: Config.ScraperMgr.NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
		.catch((err) => {
			Logger.error(`${err}`);
			return null;
		});
		if (!response) {
			page.close();
			return null;
		}
		let responseBody = await response.text();

		if (responseBody.includes("Attention Required! | Cloudflare")) { // When we get a captcha, restart browser.
			Logger.error("Captcha detected, restarting browser...");
			page.close();
			await this.restartBrowser();
			return null;
		}

		let tryCount = 0;
		while (responseBody.includes("cf-browser-verification")) {
			this.pause(true); // Pause to allow page to close and update cookies instead of letting multiple page wait for browser validation
			if (tryCount >= 2) {
				page.close();
				this.pause(false);
				return null;
			}
			let newResponse: HTTPResponse | null = await page.waitForNavigation({ timeout: Config.ScraperMgr.NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
			.catch((err) => {
				Logger.error(`${err}`);
				page.close();
				this.pause(false);
				return null;
			});


			if (!newResponse) {
				page.close();
				this.pause(false);
				return null;
			}
			response = newResponse;
			responseBody = await response.text();
			tryCount++;
		}
		
		page.close();
		this.pause(false);
		return responseBody;
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
		this.browser = await Puppeteer.launch(this.options)
		.catch((err) => {
			Logger.error(`Browser !!!!  ${err}`);
			this.pauseBrowser(false);
			return null;
		});

		if (!this.isBrowserValid()) {
			this.pauseBrowser(false);
			return false;
		}
		Logger.info("Browser started.");
		this.pauseBrowser(false);

		/* this.browser.process().on("error", () => {
			this.browser.process().kill();
		}) */

		this.browser.on("disconnected", async () => {
			Logger.error("Browser disconnected.");
			if (this.browser) {
				this.browser.process().kill();
			}
			this.browser = null;
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
			const pages = await this.browser.pages();
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
			await this.closeBrowser();
		}

		if ((Date.now() - this.lastUse)/1000 < Config.ScraperMgr.BROWSER_LIFE_SEC) {
			return;
		}

		let pages = await this.browser.pages();
		if (pages.length <= 1) { // here we set 1 because there is always one open tab.
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

		if (!this.browser.isConnected()) {
			return false;
		}

		if (this.browser.process().killed) {
			return false;
		}

		return true;
	}

}
