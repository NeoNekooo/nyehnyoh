const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

const axiosInstance = axios.create({
    httpsAgent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
});

async function test() {
    try {
        console.log('--- Testing Popular ---');
        const popRes = await axiosInstance.get('https://api.komiku.org/manga/?orderby=meta_value_num');
        const $pop = cheerio.load(popRes.data);
        console.log('Popular Found:', $pop('.bge').length);
        $pop('.bge').slice(0, 3).each((i, el) => {
            console.log(`- ${$pop(el).find('h3').text().trim()}`);
        });

        console.log('\n--- Testing Detail (One Piece) ---');
        const detRes = await axiosInstance.get('https://komiku.org/manga/komik-one-piece-indo/');
        const $det = cheerio.load(detRes.data);
        const title = $det('.dsk h1').text().trim();
        console.log('Title:', title);
        const chapters = [];
        $det('.judulseries a').each((i, el) => {
            const chId = $det(el).attr('href').replace(/\//g, '');
            chapters.push(chId);
        });
        console.log('Chapters Found:', chapters.length);
        console.log('Latest Chapter ID:', chapters[0]);

        console.log('\n--- Testing Images ---');
        const imgRes = await axiosInstance.get(`https://komiku.org/${chapters[0]}/`);
        const $img = cheerio.load(imgRes.data);
        const images = [];
        $img('#Baca_Komik img').each((i, el) => {
            images.push($img(el).attr('src'));
        });
        console.log('Images Found:', images.length);
        if (images.length > 0) console.log('First Image:', images[0]);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
