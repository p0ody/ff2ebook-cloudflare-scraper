import Puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
Puppeteer.use(StealthPlugin());
import Logger from "loglevel";
Logger.setLevel("debug");

import { QueueMgr } from "./QueueMgr";
import { Config } from '../conf/config';
import { Browser } from 'puppeteer-extra-plugin/dist/puppeteer';

interface BrowserOptions {
	headless: boolean,
	args: Array<string>
}

export class ScraperMgr {
	private queue: QueueMgr;
	private options: BrowserOptions;
	private browser: Browser | null;
	private lastUse: number;
	private paused: boolean;
	constructor() {
		this.browser = null;
		this.queue = new QueueMgr();
		this.paused = false;
		this.options = {
			headless: Config.ScraperMgr.PUPPETEER_HEADLESS,
			args: ["--no-sandbox", "--disable-setuid-sandbox"]
		};
		if (Config.ScraperMgr.PROXY_URL.length){
			this.options.args.push(`--proxy-server=${Config.ScraperMgr.PROXY_URL}`);
		}
		this.updateLastUsed();

		setInterval(async () => await this.browserLife(), Config.ScraperMgr.LOOP_INTERVAL_MS);
	}

	async getPage(url: string) {
		while (true) {
			if (!this.paused) {
				if (!this.browser) {
					await this.startBrowser();
				}
	
				const pages = await this.browser.pages();
				const pagesCount = pages.length;
				if (pagesCount < Config.ScraperMgr.MAX_ASYNC_PAGE) {
					break;
				}
			}
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS); // Add a delay to slow down the check.
		}
		await this.checkBrowserExist();

		const page = await this.browser.newPage();

		if (Config.ScraperMgr.PROXY_AUTH.username) {
			await page.authenticate(Config.ScraperMgr.PROXY_AUTH);
		}
	
		let response = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
		let responseBody = await response.text();
		let responseData = await response.buffer();
		
		if (responseBody.includes("Attention Required! | Cloudflare")) { // When we get a captcha, restart browser.
			Logger.error("Captcha detected, restarting browser");
			await page.close();
			this.paused = true;
			const timer = Date.now();
			let pagesCount = 2;
			do  { // Wait for other requests to finish, wait maximum of 10 sec.
				const pages = await this.browser.pages();
				pagesCount = pages.length;
				await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
			} while (pagesCount > 1 && (Date.now() - timer) < 10000);
			if (this.browser) {
				await this.browser.close();
				await this.delay(2000);
				this.browser = null;
			}
			this.paused = false;
			return null;
		}

		let tryCount = 0;
		while (responseBody.includes("cf-browser-verification") && tryCount <= 6) {
			let newResponse = await page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' });
			if (newResponse) {
				response = newResponse;
			}
			responseBody = await response.text();
			responseData = await response.buffer();
			tryCount++;
		}
		// Add a delay before close page to slowdown the requests to reduce the chances of getting banned.
		this.delay(Config.ScraperMgr.SLOWDOWN_MS).then(async () => await page.close());
		
		return responseBody;
	}

	private async startBrowser() {
		this.paused = true;
		this.browser = await Puppeteer.launch(this.options);
		while (!this.browser.isConnected()) { // Wait for browser to be connected.
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		}
		this.paused = false;

		this.browser.on("disconnected", async () => {
			this.browser = null;
			this.paused = true;
			await this.delay(5000); // Add delay to avoid starting multiple browser at the same time
			this.paused = false;
		});
		this.updateLastUsed();
		return this.browser;
	}

	private async delay(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private async checkBrowserExist() {
		if (!this.browser || !this.browser.isConnected()) {
			await this.startBrowser();
		}

		this.updateLastUsed();
	}

	/**
	 * Close browser if the browser has not been used in the last xx seconds. See Config.ScraperMgr.BROWSER_LIFE_SEC
	 * @returns void
	 */
	private async browserLife(): Promise<void> {
		if (!this.browser) {
			return;
		}

		if ((Date.now() - this.lastUse)/1000 < Config.ScraperMgr.BROWSER_LIFE_SEC) {
			return;
		}

		let pages = await this.browser.pages();
		if (pages.length <= 1) { // here we set 1 because there is always one open tab.
			Logger.info("Closing browser due to inactivity.");
			this.paused = true;
			await this.browser.close();
			this.browser = null;
			await this.delay(2000); // Add delay to avoid starting multiple browser at the same time
			this.paused = false;
		}
	}

	private async updateLastUsed() {
		this.lastUse = Date.now();
	}
}
