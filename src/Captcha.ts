import Playwright from "playwright";
import Logger from "loglevel";

/** Return true if it succeeded to solve the captcha and false if it failed */
export async function handleCaptcha(page: Playwright.Page): Promise<boolean> { // Check if a captcha is present and try to complete it
    const content = await page.content().catch(() => { return null });
    if (!content) {
        return false;
    }

    if (content.includes("Attention Required! | Cloudflare")) { // Random blocking
        return false;
    }

    if (content.includes("hcaptcha-box")) { // Clickable captha
        Logger.info("trying check captcha");
        const checkbox = page.locator("css=input[type=checkbox]");
        console.log(checkbox);
        await checkbox.check();
        return true;
        
    }

    if (content.includes("big-button")) {
        const button = page.locator("css=.big-button");
        Logger.info("trying button captcha");
        button.click({ button:"left" });
        return true;
    }

    return true;
}

async function completeClickCaptcha(page: Playwright.Page) {


}