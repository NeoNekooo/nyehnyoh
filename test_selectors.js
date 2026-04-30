const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('detail_onepiece.html', 'utf8');
const $ = cheerio.load(html);

console.log('Title:', $('h1').text().trim());
console.log('Sinopsis:', $('#Sinopsis p').text().trim() || $('#Sinopsis').text().trim());
console.log('Cover:', $('.ims img').attr('src'));
console.log('Chapters Found:', $('.judulseries a').length);
