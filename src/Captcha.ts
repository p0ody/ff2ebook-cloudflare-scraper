import Playwright from "playwright";
import Logger from "loglevel";


export async function solveCaptcha(page: Playwright.Page): Promise<boolean> {
    
    const titleTest = page.waitForFunction(() => document.title != "Just a moment...", null, { timeout: 10000 })
    .then(() => { return true; }, () => { return false; });

    const turnstileTest = page.locator("#turnstile-wrapper").waitFor({state: "visible", timeout: 5000}).then(async () => {
        //Logger.info(await page.content());
        //Logger.info("Turnstile detected...");
        return await handleTurnstile(page);
    }, () => { return false; });

    const bigButtonTest = page.locator(".big-button").waitFor({ state: "visible", timeout: 5000}).then(async () => {
        //Logger.info("Big button detected...");
        return await handleBigButton(page);
    }, () => { return false; });

    
    const stringCheck = new Promise<boolean>(async (resolve, reject) => {
        const content = await page.content().catch((err) => { throw err });
        if (content.includes("Attention Required! | Cloudflare") 
        ||  content.includes("hcaptcha-box")) {
            resolve(false);
            return false;
        }

        reject();
    });

    return await Promise.any([titleTest, turnstileTest, bigButtonTest, stringCheck]);
}

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function handleTurnstile(page: Playwright.Page): Promise<boolean> {
    
    const pageChange = page.waitForFunction(() => {
        document.title != "Just a moment...";
    }, null, { timeout: 8000 }).then(() => {
        Logger.info("Page changed");
        return true;
    })

    const checkBox = page.frameLocator("#turnstile-wrapper iframe").locator('.ctp-checkbox-label input[type="checkbox"]');
    const turnstileSolve = checkBox.waitFor({ state: "visible", timeout: 5000 }).then(() => {
        checkBox.click();
        Logger.info("Turnstile clicked");
        return true;
    }, () => {
        return false;
    });

    return await Promise.any([pageChange, turnstileSolve]);
}

async function handleBigButton(page: Playwright.Page): Promise<boolean> {
    await page.locator(".big-button").click();
    Logger.info("Big button clicked.");
    return true;
}