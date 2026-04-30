const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('dump_komiku.html', 'utf8');
const $ = cheerio.load(html);

console.log('Manga Links Found:');
$('.bge').each((i, el) => {
    const title = $(el).find('h3').text().trim();
    const link = $(el).find('a').attr('href');
    console.log(`- ${title} (${link})`);
});

if ($('.bge').length === 0) {
    console.log('No .bge found. Checking for any <h3> tags:');
    $('h3').each((i, el) => {
        console.log(`- ${$(el).text().trim()}`);
    });
}
