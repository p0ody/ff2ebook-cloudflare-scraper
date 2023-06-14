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
        //const checkbox = page.locator("css=.ctp-checkbox-label");
        //await page.mouse.move(65, 280);
        await page.mouse.click(65, 280);
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

export async function containCaptcha(page: Playwright.Page): Promise<boolean> {
    await page.waitForLoadState("domcontentloaded");
    const content = await page.content().catch((err) => { throw err });

    if (content.includes("Attention Required! | Cloudflare") 
    ||  content.includes("hcaptcha-box") 
    ||  content.includes("big-button")
    ||  content.includes("turnstile-wrapper")) {
        return true;
    }

    return false;
}

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}