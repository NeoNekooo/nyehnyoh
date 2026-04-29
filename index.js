require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const dns = require('dns');

const app = express();
const port = process.env.PORT || 4000;
const cache = new NodeCache({ stdTTL: 600 }); 

app.use(cors());
app.use(express.json());

const MANGADEX_API = 'https://api.mangadex.org';

const getTitle = (attributes) => {
    return attributes.title.en || attributes.title.ja || attributes.title['ja-ro'] || Object.values(attributes.title)[0];
};

// 1. HOME FEED (TRENDING/POPULAR)
app.get('/api/manga/popular', async (req, res) => {
    try {
        const cachedData = cache.get("popular");
        if (cachedData) return res.json({ status: "success", data: cachedData });

        const response = await axios.get(`${MANGADEX_API}/manga`, {
            params: {
                limit: 15,
                'includes[]': 'cover_art',
                'order[followedCount]': 'desc',
                'contentRating[]': ['safe', 'suggestive']
            }
        });

        const mangaList = response.data.data.map(m => {
            const coverRel = m.relationships.find(r => r.type === 'cover_art');
            const fileName = coverRel ? coverRel.attributes?.fileName : null;
            return {
                id: m.id,
                title: getTitle(m.attributes),
                coverUrl: fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null,
                status: m.attributes.status
            };
        });

        cache.set("popular", mangaList);
        res.json({ status: "success", data: mangaList });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 2. LATEST UPDATES (BARU UPDATE CHAPTER)
app.get('/api/manga/latest', async (req, res) => {
    try {
        const cachedData = cache.get("latest");
        if (cachedData) return res.json({ status: "success", data: cachedData });

        const response = await axios.get(`${MANGADEX_API}/manga`, {
            params: {
                limit: 15,
                'includes[]': 'cover_art',
                'order[latestUploadedChapter]': 'desc',
                'contentRating[]': ['safe', 'suggestive']
            }
        });

        const mangaList = response.data.data.map(m => {
            const coverRel = m.relationships.find(r => r.type === 'cover_art');
            const fileName = coverRel ? coverRel.attributes?.fileName : null;
            return {
                id: m.id,
                title: getTitle(m.attributes),
                coverUrl: fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null,
                status: m.attributes.status
            };
        });

        cache.set("latest", mangaList);
        res.json({ status: "success", data: mangaList });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 2. SEARCH MANGA
app.get('/api/manga/search', async (req, res) => {
    const { q } = req.query;
    try {
        const response = await axios.get(`${MANGADEX_API}/manga`, {
            params: {
                title: q,
                limit: 20,
                'includes[]': 'cover_art',
                'contentRating[]': ['safe', 'suggestive']
            }
        });

        const mangaList = response.data.data.map(m => {
            const coverRel = m.relationships.find(r => r.type === 'cover_art');
            const fileName = coverRel ? coverRel.attributes?.fileName : null;
            return {
                id: m.id,
                title: getTitle(m.attributes),
                coverUrl: fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null,
                status: m.attributes.status,
                year: m.attributes.year
            };
        });

        res.json({ status: "success", data: mangaList });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 3. MANGA DETAIL (SINOPSIS & TAGS)
app.get('/api/manga/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await axios.get(`${MANGADEX_API}/manga/${id}`, {
            params: { 'includes[]': 'cover_art' }
        });
        const m = response.data.data;
        const coverRel = m.relationships.find(r => r.type === 'cover_art');
        const fileName = coverRel ? coverRel.attributes?.fileName : null;

        res.json({
            status: "success",
            data: {
                id: m.id,
                title: getTitle(m.attributes),
                description: m.attributes.description.en || Object.values(m.attributes.description)[0],
                coverUrl: fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg` : null,
                status: m.attributes.status,
                year: m.attributes.year,
                tags: m.attributes.tags.map(t => t.attributes.name.en)
            }
        });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 4. GET CHAPTERS (INDONESIA FIRST)
app.get('/api/manga/:id/chapters', async (req, res) => {
    const { id } = req.params;
    try {
        const response = await axios.get(`${MANGADEX_API}/manga/${id}/feed`, {
            params: {
                'translatedLanguage[]': ['id', 'en'],
                'order[chapter]': 'desc',
                limit: 100,
                'contentRating[]': ['safe', 'suggestive']
            }
        });

        const chapters = response.data.data.map(c => ({
            id: c.id,
            chapter: c.attributes.chapter,
            title: c.attributes.title || `Chapter ${c.attributes.chapter}`,
            language: c.attributes.translatedLanguage,
            publishAt: c.attributes.publishAt
        }));

        res.json({ status: "success", data: chapters });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 5. GET CHAPTER IMAGES (MANGADEX@HOME)
app.get('/api/manga/chapter/:chapterId/images', async (req, res) => {
    const { chapterId } = req.params;
    try {
        const serverRes = await axios.get(`${MANGADEX_API}/at-home/server/${chapterId}`);
        const { baseUrl, chapter } = serverRes.data;
        // Pake /data/ buat kualitas HD
        const images = chapter.data.map(filename => `${baseUrl}/data/${chapter.hash}/${filename}`);

        res.json({ status: "success", data: images });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

app.listen(port, () => {
    console.log(`=========================================`);
    console.log(`YEH YOH MANGA BACKEND IS ONLINE 🚀`);
    console.log(`Port: ${port}`);
    console.log(`DNS 1.1.1.1 Recommended for Local Dev 🛡️`);
    console.log(`=========================================`);
});
