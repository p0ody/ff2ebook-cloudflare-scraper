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
	constructor() {
		this.browser = null;
		this.queue = new QueueMgr();
		this.options = {
			headless: Config.ScraperMgr.PUPPETEER_HEADLESS,
			args: ["--no-sandbox", "--disable-setuid-sandbox"]
		};
		if (Config.ScraperMgr.PROXY_URL.length){
			this.options.args.push(`--proxy-server=${Config.ScraperMgr.PROXY_URL}`);
		}
		this.updateLastUsed();

		setInterval(() => this.browserLife(), Config.ScraperMgr.LOOP_INTERVAL_MS);
	}

	async scrape(url: string) {
		await this.checkBrowserExist();
		const id = this.queue.push(url);
		return await this.execQueue(id);
	}

	private async execQueue(id: string) {
		await this.checkBrowserExist();
		while (true) {
			if (this.queue.isEmpty) {
				Logger.error("Empty queue when it should not be...");
				return null;
			}
			
			if (!this.browser) {
				Logger.error("Browser not started.")
				return null;
			}

			let pages = await this.browser.pages();
			let pagesCount = pages.length;
			if (pagesCount < Config.ScraperMgr.MAX_ASYNC_PAGE) {
				if (this.queue.next.id == id) {
					break;
				}
			}
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS); // Add a delay to slow down the check.
		}
		let entry = this.queue.pull();
		return await this.getPage(entry.data);
	}

	private async getPage(url: string) {
		try {
			this.checkBrowserExist();

			const page = await this.browser.newPage();

			if (Config.ScraperMgr.PROXY_AUTH.username) {
				await page.authenticate(Config.ScraperMgr.PROXY_AUTH);
			}
		
			let response = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
			let responseBody = await response.text();
			let responseData = await response.buffer();
			let tryCount = 0;
			while (responseBody.includes("cf-browser-verification") && tryCount <= 10) {
				let newResponse = await page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' });
				if (newResponse) {
					response = newResponse;
				}
				responseBody = await response.text();
				responseData = await response.buffer();
				tryCount++;
			}
			// Add a delay before close page to slowdown the requests to reduce the chances of getting banned.
			this.delay(Config.ScraperMgr.SLOWDOWN_MS).then(() => page.close());
			
			return responseBody;
		}
		catch (err) {
			Logger.error(err);
		}
		finally {
			
		}
	}

	private async startBrowser() {
		this.browser = await Puppeteer.launch(this.options);
		this.browser.on("disconnected", () => {
			this.browser = null;
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
			this.browser = null;
			this.browser.close();
		}
	}

	private async updateLastUsed() {
		this.lastUse = Date.now();
	}
}
