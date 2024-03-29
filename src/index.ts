import Koa = require("koa");
import BodyParser = require("koa-bodyparser");
import Logger from "loglevel";
Logger.setLevel("debug");

import { ScraperMgr } from "./ScraperMgr";
import { QueueMgr } from "./QueueMgr";
import { Config } from "./Config";

const app = new Koa();
app.use(BodyParser());

const scraper = new ScraperMgr();
const queue = new QueueMgr(Config.ScraperMgr.MAX_ASYNC_PAGE, Config.ScraperMgr.NAV_TIMEOUT_MS, 100);
let requestCount = 0;
	
app.use(async ctx => {	
	if (ctx.method == "POST") {
		return;
	}
	if (ctx.path == "/queue") {
		ctx.body = queue.queueLength;
		return;
	}
	
	if (ctx.query.url) {
		requestCount++;
		let url = <string>ctx.query.url
		Logger.info(`#${requestCount} - Url: ${url}, QueueSize: ${queue.queueLength}`);
		
 		let id = queue.push(async () => await scraper.getPage(url).catch((err) => { Logger.error(`getPage Error: ${err}`)}));
		const res = await queue.waitFor(id);
		ctx.body = res;
	}
	else {
		 ctx.body = "No URL specified.";
	}
})
app.listen(Config.App.LISTENING_PORT);
Logger.info(`Now listening on port ${Config.App.LISTENING_PORT}`);

process.on("uncaughtException", (err: Error) => {
	Logger.error("uncaughtException: "+ err.message);
});

process.on("unhandledRejection", (err: Error) => {
	Logger.error("unhandledRejection: "+ err.message);
});

process.on("SIGTERM", () => {
	process.exit();
})
