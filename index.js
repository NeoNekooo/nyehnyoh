const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 600 });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const MANGADEX_API = 'https://api.mangadex.org';

// Fungsi Proxy biar gak diblokir ISP
const proxyImg = (url) => {
    if (!url) return null;
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&default=${encodeURIComponent(url)}`;
};

const GENRES = {
    'Action': '391b0423-db2a-4b90-b076-581e053926bd',
    'Adventure': '87cc686b-270c-48a2-ae0e-995a5712157e',
    'Comedy': '4d32b451-113d-4f9a-94a8-71562f8a2a70',
    'Drama': 'b9af3a06-384e-4867-8334-752ba2af1530',
    'Fantasy': 'cdc58593-3903-4919-946c-ae9911f4afaf',
    'Romance': '423e2eae-9ee6-4a4a-9561-1befed322c59',
    'Sci-Fi': '256c8004-7136-47ae-b215-56273040c56b',
    'Horror': 'cdad7e68-1419-41dd-9a17-6d0c64d85282',
    'Mystery': 'ee963339-da4f-4b61-86d7-b9502b77d3ee',
    'Sports': '6995f6a2-2039-4375-b049-51c053303699'
};

const getTitle = (attributes) => {
    return attributes.title.en || attributes.title.ja || attributes.title['ja-ro'] || Object.values(attributes.title)[0];
};

app.get('/api/manga/popular', async (req, res) => {
    const { nsfw, tag } = req.query;
    try {
        const cachedKey = `popular_${nsfw}_${tag}`;
        const cachedData = cache.get(cachedKey);
        if (cachedData) return res.json({ status: "success", data: cachedData });

        const ratings = ['safe', 'suggestive'];
        if (nsfw === 'true') ratings.push('erotica', 'pornographic');

        let url = `${MANGADEX_API}/manga?limit=50&includes[]=cover_art&order[followedCount]=desc`;
        ratings.forEach(r => url += `&contentRating[]=${r}`);
        if (tag && GENRES[tag]) url += `&includedTags[]=${GENRES[tag]}`;

        const response = await axios.get(url);
        const mangaList = response.data.data.map(m => {
            const coverRel = m.relationships.find(r => r.type === 'cover_art');
            const fileName = coverRel ? coverRel.attributes?.fileName : null;
            const originalUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null;
            return {
                id: m.id,
                title: getTitle(m.attributes),
                coverUrl: proxyImg(originalUrl),
                status: m.attributes.status
            };
        });

        cache.set(cachedKey, mangaList);
        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/manga/latest', async (req, res) => {
    const { nsfw, tag } = req.query;
    try {
        const cachedKey = `latest_${nsfw}_${tag}`;
        const cachedData = cache.get(cachedKey);
        if (cachedData) return res.json({ status: "success", data: cachedData });

        const ratings = ['safe', 'suggestive'];
        if (nsfw === 'true') ratings.push('erotica', 'pornographic');

        let url = `${MANGADEX_API}/manga?limit=50&includes[]=cover_art&order[latestUploadedChapter]=desc`;
        ratings.forEach(r => url += `&contentRating[]=${r}`);
        if (tag && GENRES[tag]) url += `&includedTags[]=${GENRES[tag]}`;

        const response = await axios.get(url);
        const mangaList = response.data.data.map(m => {
            const coverRel = m.relationships.find(r => r.type === 'cover_art');
            const fileName = coverRel ? coverRel.attributes?.fileName : null;
            const originalUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null;
            return {
                id: m.id,
                title: getTitle(m.attributes),
                coverUrl: proxyImg(originalUrl),
                status: m.attributes.status
            };
        });

        cache.set(cachedKey, mangaList);
        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/manga/search', async (req, res) => {
    const { q, nsfw } = req.query;
    try {
        const ratings = ['safe', 'suggestive'];
        if (nsfw === 'true') ratings.push('erotica', 'pornographic');
        let url = `${MANGADEX_API}/manga?limit=20&includes[]=cover_art`;
        if (q) url += `&title=${encodeURIComponent(q)}`;
        ratings.forEach(r => url += `&contentRating[]=${r}`);
        
        const response = await axios.get(url);
        const mangaList = response.data.data.map(m => {
            const coverRel = m.relationships.find(r => r.type === 'cover_art');
            const fileName = coverRel ? coverRel.attributes?.fileName : null;
            const originalUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null;
            return {
                id: m.id,
                title: getTitle(m.attributes),
                coverUrl: proxyImg(originalUrl),
                status: m.attributes.status
            };
        });
        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/manga/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const response = await axios.get(`${MANGADEX_API}/manga/${id}?includes[]=cover_art`);
        const m = response.data.data;
        const coverRel = m.relationships.find(r => r.type === 'cover_art');
        const fileName = coverRel ? coverRel.attributes?.fileName : null;
        const originalUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg` : null;
        const detail = {
            id: m.id,
            title: getTitle(m.attributes),
            description: m.attributes.description.en || Object.values(m.attributes.description)[0],
            coverUrl: proxyImg(originalUrl),
            status: m.attributes.status,
            tags: m.attributes.tags.map(t => t.attributes.name.en)
        };
        res.json({ status: "success", data: detail });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/manga/:id/chapters', async (req, res) => {
    const { id } = req.params;
    try {
        let url = `${MANGADEX_API}/manga/${id}/feed?limit=500&order[chapter]=asc&translatedLanguage[]=id&translatedLanguage[]=en`;
        ['safe', 'suggestive', 'erotica', 'pornographic'].forEach(r => url += `&contentRating[]=${r}`);
        const response = await axios.get(url);
        const chapters = response.data.data.map(c => ({
            id: c.id,
            chapter: c.attributes.chapter,
            title: c.attributes.title || `Chapter ${c.attributes.chapter}`,
            language: c.attributes.translatedLanguage
        }));
        res.json({ status: "success", data: chapters });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/chapter/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const response = await axios.get(`${MANGADEX_API}/at-home/server/${id}`, { timeout: 15000 });
        const { baseUrl, chapter } = response.data;
        const imgList = (chapter.dataSaver && chapter.dataSaver.length > 0) ? chapter.dataSaver : chapter.data;
        const subPath = (chapter.dataSaver && chapter.dataSaver.length > 0) ? 'data-saver' : 'data';
        const images = imgList.map(img => {
            const originalUrl = `${baseUrl}/${subPath}/${chapter.hash}/${img}`;
            return proxyImg(originalUrl);
        });
        res.json({ status: "success", data: images });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
module.exports = app;
