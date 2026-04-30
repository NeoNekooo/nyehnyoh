const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const url = 'https://komiku.id/manga/?orderby=meta_value_num';
        console.log('Fetching:', url);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        const mangaList = [];

        $('.bge').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            console.log('Found:', title);
        });
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
    }
}

test();
