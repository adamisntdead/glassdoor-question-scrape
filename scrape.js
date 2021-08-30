const puppeteer = require('puppeteer')
const fs = require('fs')
const cheerio = require('cheerio')

const CONFIG = {
    username: 'sampleusername', // This might be your email
    password: 'samplepassword',

    // Change these to match your region and the page that you want to scrape
    glassdoorHome: 'https://www.glassdoor.ie/index.htm',
    questionsPage: 'https://www.glassdoor.ie/Interview/Five-Rings-Interview-Questions-E375785', // Exclude.htm
    numPages: 18,
    outputName: 'five-rings'
}

async function glassdoorLogin(page) {
    // Go to the login page
    await page.goto(CONFIG.glassdoorHome, {
        waitUntil: 'networkidle2'
    })

    // Wait for the page to load, then click the sign in button
    await page.waitForSelector('.LockedHomeHeaderStyles__signInButton')
    await page.$eval('.LockedHomeHeaderStyles__signInButton', el => el.click())

    // Wait for the sign in panel to appear, and input the username and password
    await page.waitForSelector('input[name=username]')
    await page.$eval('input[name=username]', (el, CONFIG) => el.value = CONFIG.username, CONFIG)
    await page.$eval('input[name=password]', (el, CONFIG) => el.value = CONFIG.password, CONFIG)

    // Perform the login, and wait for the page to load
    await page.$eval('button[name=submit]', el => el.click())
    await page.waitForNavigation()
}

async function scrapeInterviewQuestions(page, url) {
    await page.goto(url, { waitUntil: 'networkidle2' })

    await page.waitForSelector('.logo')

    const data = await page.evaluate(() => {
        const results = []
        const elements = document.querySelectorAll('.css-ck2v56')
        elements.forEach(el => results.push(el.innerHTML))

        return results
    })

    fs.appendFileSync(`${CONFIG.outputName}.txt`, JSON.stringify(data) + '================================================')
    console.log('Finished: ' + url)
}


function parseQuestion(html) {
    const $ = cheerio.load(html)
    const type = $('.css-5j5djr').text()

    if (!type) return

    const interviewQuestions = []

    const interview = $('.css-lyyc14').text()
    const time = $('time').text()

    $('span.mb-sm').each(function (i, el) {
        interviewQuestions.push($(this).text())
    })


    return { type, time, interview, interviewQuestions }
}

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await glassdoorLogin(page)

    for (let i = 1; i <= CONFIG.numPages; i++) {
        const pageExtension = i === 1 ? '.htm' : `_P${i}.htm`
        const pageUrl = CONFIG.questionsPage + pageExtension

        await scrapeInterviewQuestions(page, pageUrl)
    }

    await browser.close()

    const questions = fs.readFileSync(`${CONFIG.outputName}.txt`, 'utf-8')

    const batches = questions.split('================================================')
    const parsed = []

    for (let i = 0; i < batches.length - 1; i++) {
        parsed.push(JSON.parse(batches[i]))
    }

    const finalList = []

    parsed.forEach(list => list.forEach(html => {
        const p = parseQuestion(html)
        if (p) finalList.push(p)
    }))

    fs.writeFileSync(`${CONFIG.outputName}.json`, JSON.stringify(finalList))
    fs.deleteFileSync(`${CONFIG.outputName}.txt`)

    const qs = []

    finalList.forEach(x => {
        x.interviewQuestions.forEach(q => qs.push(q))
    })

    let output = '# Interview Questions\n\n> This is an unfiltered collection of responses detailing questions people were asked at their interview.\n\n'

    qs.forEach(q => {
        output += `\n* ${q.replaceAll('\n', '; ')}`
    })


    fs.writeFileSync(`${CONFIG.outputName}.md`, output)
})();