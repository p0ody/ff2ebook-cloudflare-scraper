import Koa = require("koa");
import BodyParser = require("koa-bodyparser");
import Logger from "loglevel";
Logger.setLevel("debug");

import { ScraperMgr } from "./ScraperMgr";
import { Config } from "../conf/config";


const app = new Koa();
app.use(BodyParser());

const scraper = new ScraperMgr();
let requestCount = 0;
app.use(async ctx => {	
	if (ctx.method == "POST") {
		return;
	}
	if (ctx.query.url) {
		requestCount++;
		let url = <string>ctx.query.url
		Logger.info(`#${requestCount} - Url: ${url}`);
		const res = await scraper.scrape(url);
		ctx.body = res;
	}
	else {
		Logger.error("No URL specified.");
	}
})
app.listen(Config.App.LISTENING_PORT);
