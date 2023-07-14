import Playwright from "playwright";
import Logger from "loglevel";

/** Return true if it succeeded to solve the captcha and false if it failed */
export async function handleCaptcha(page: Playwright.Page): Promise<boolean> { // Check if a captcha is present and try to complete it
    await page.waitForLoadState("domcontentloaded");
    const content = await page.content().catch((err) => { throw err });
    if (!content) {
        return false;
    }

    if (content.includes("Attention Required! | Cloudflare")) { // Random blocking
        return false;
    }

    if (content.includes("hcaptcha-box")
    ||  content.includes("turnstile-wrapper")) { // Clickable captha
        Logger.info("trying check captcha");
        //page.locator(`.ctp-checkbox-label input[type="checkbox"]`).click();
        //const checkbox = page.locator("css=.ctp-checkbox-label");
        //await page.mouse.move(65, 280);
        await page.mouse.click(65, 290);
        await delay(1000);
        return true;
    }

    if (content.includes("big-button")) {
        const button = page.locator("css=.big-button");
        Logger.info("trying button captcha");
        button.click();
        return true;
    }

    return false;
}

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