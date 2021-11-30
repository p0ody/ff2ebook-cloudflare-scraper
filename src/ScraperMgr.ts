import Puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
Puppeteer.use(StealthPlugin());
import Logger from "loglevel";
Logger.setLevel("debug");
import { ChildProcess } from "child_process";

import { Config } from '../conf/config';
import { Browser } from 'puppeteer-extra-plugin/dist/puppeteer';


interface BrowserOptions {
	headless?: boolean,
	args?: Array<string>,
	userDataDir?: string,
	slowMo?: number,
}

export class ScraperMgr {
	private options: BrowserOptions;
	private browser: Browser | null;
	private lastUse: number;
	private paused: boolean;
	private pausedSince: number | null;
	private processes: Array<ChildProcess>
	constructor() {
		this.browser = null;
		this.paused = false;
		this.processes = [];
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

		const page = await this.browser.newPage();

		if (Config.ScraperMgr.PROXY_AUTH.username) {
			await page.authenticate(Config.ScraperMgr.PROXY_AUTH);
		}
	
		let response = await page.goto(url, { timeout: Config.ScraperMgr.NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
		let responseBody = await response.text();
		let responseData = await response.buffer();
		
		if (responseBody.includes("Attention Required! | Cloudflare")) { // When we get a captcha, restart browser.
			Logger.error("Captcha detected, restarting browser...");
			await page.close();
			await this.closeBrowser();
			return null;
		}

		let tryCount = 0;
		while (responseBody.includes("cf-browser-verification")) {
			this.pause(true); // Pause to allow page to close and update cookies instead of letting multiple page wait for browser validation
			if (tryCount >= 2) {
				await page.close();
				this.pause(false);
				return null;
			}
			let newResponse = await page.waitForNavigation({ timeout: Config.ScraperMgr.NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
			if (newResponse) {
				response = newResponse;
			}
			responseBody = await response.text();
			responseData = await response.buffer();
			tryCount++;
		}
		// Add a delay before close page to slowdown the requests to reduce the chances of getting banned.
		this.delay(Config.ScraperMgr.SLOWDOWN_MS).then(async () => {
			await page.close();
			this.pause(false);
		});
		
		return responseBody;
	}

	private async startBrowser() {
		while (this.paused) { // If already paused, dont start a new browser to avoid starting multiple browser.
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		}
		if (this.browser && this.browser.isConnected()) {
			return this.browser;
		}

		this.pause(true);
		await this.forceKill(); // Make sure to kill any instance of browser before starting new one
		this.browser = await Puppeteer.launch(this.options);
		while (!this.browser.isConnected()) {
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		}

		this.processes.push(this.browser.process());
		this.pause(false);

		this.browser.on("disconnected", async () => {
			Logger.error("Browser disconnected.");
			await this.closeBrowser();
		});
		this.updateLastUsed();
		return this.browser;
	}

	private async closeBrowser(): Promise<boolean> {
		if (!this.browser) {
			this.forceKill();
			return true;
		}

		this.pause(true);
		let pagesCount = 0;
		let timer = Date.now();
		do  { // Wait for other requests to finish, wait maximum of 10 sec.
			const pages = await this.browser.pages();
			pagesCount = pages.length;
			await this.delay(Config.ScraperMgr.LOOP_INTERVAL_MS);
		} while (pagesCount > 1 && (Date.now() - timer) < 10000);

		if (this.browser) {
			await this.browser.close();
		}
		
		while (this.processes.length > 0) { // Kill a child process to make sure no browser stays open.
			this.processes.pop().kill();
		}

		await this.delay(3000);
		this.browser = null;
		this.pause(false);
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
		if (!this.browser) {
			return;
		}

		if (!this.browser.isConnected()) {
			this.closeBrowser();
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

	private async forceKill() {
		while (this.processes.length > 0) { // Kill a child process to make sure no browser stays open.
			this.processes.pop().kill();
		}
	}
}
