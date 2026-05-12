const express = require('express');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const cors = require('cors');

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

const axiosInstance = axios.create({
    httpsAgent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
});
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 600 });
const PORT = process.env.PORT || 3000;
const mongoose = require('mongoose');

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://manganya_db:Tl2NcAufyJrBuU6T@cluster0.x7iu4xb.mongodb.net/manganyan?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const FrameSchema = new mongoose.Schema({
    name: String,
    imageUrl: String
});
const Frame = mongoose.model('Frame', FrameSchema);

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: String,
    frame: { type: mongoose.Schema.Types.ObjectId, ref: 'Frame', default: null }
});
const User = mongoose.model('User', UserSchema);

app.use(cors());
app.use(express.json());

const MANGADEX_API = 'https://api.mangadex.org';
const KOMIKU_BASE = 'https://komiku.org';
const KOMIKU_API = 'https://api.komiku.org';

// Fungsi Proxy biar gak diblokir ISP
const proxyImg = (url) => {
    if (!url) return null;
    // Bersihkan parameter resize dari Komiku biar gak gepeng/jelek
    let cleanUrl = url.split('?')[0];
    // Pakai weserv buat nge-crop otomatis ke rasio portrait (3:4 atau 2:3) biar rapi di UI
    return `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&w=300&h=450&fit=cover&a=top&default=${encodeURIComponent(url)}`;
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

// === AUTH & PROFILE SYSTEM (MONGODB VERSION) ===

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ status: "error", message: "Username sudah ada" });
        
        const newUser = new User({ 
            username, 
            password, 
            avatar: `https://ui-avatars.com/api/?name=${username}&background=random`
        });
        await newUser.save();
        res.json({ status: "success", data: newUser });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password }).populate('frame');
        if (!user) return res.status(401).json({ status: "error", message: "Login gagal" });
        res.json({ status: "success", data: user });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/user/profile/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('frame');
        if (!user) return res.status(404).json({ status: "error", message: "User tidak ditemukan" });
        res.json({ status: "success", data: user });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/admin/frames', async (req, res) => {
    try {
        const { name, imageUrl } = req.body;
        const newFrame = new Frame({ name, imageUrl });
        await newFrame.save();
        res.json({ status: "success", data: newFrame });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/frames', async (req, res) => {
    try {
        const frames = await Frame.find();
        res.json({ status: "success", data: frames });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().populate('frame');
        res.json({ status: "success", data: users });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/user/update-frame', async (req, res) => {
    try {
        const { userId, frameId } = req.body;
        const user = await User.findByIdAndUpdate(userId, { frame: frameId }, { new: true }).populate('frame');
        if (!user) return res.status(404).json({ status: "error", message: "User not found" });
        res.json({ status: "success", data: user });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

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
                status: m.attributes.status,
                source: 'mangadex'
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
                status: m.attributes.status,
                source: 'mangadex'
            };
        });

        cache.set(cachedKey, mangaList);
        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/manga/search', async (req, res) => {
    const { q, nsfw, tag, status } = req.query;
    try {
        const ratings = ['safe', 'suggestive'];
        if (nsfw === 'true') ratings.push('erotica', 'pornographic');
        let url = `${MANGADEX_API}/manga?limit=50&includes[]=cover_art`;
        if (q) url += `&title=${encodeURIComponent(q)}`;
        if (tag && GENRES[tag]) url += `&includedTags[]=${GENRES[tag]}`;
        if (status) url += `&status[]=${status}`;
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
                status: m.attributes.status,
                source: 'mangadex'
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
            tags: m.attributes.tags.map(t => t.attributes.name.en),
            source: 'mangadex'
        };
        res.json({ status: "success", data: detail });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/manga/:id/related', async (req, res) => {
    const { id } = req.params;
    try {
        const mangaRes = await axios.get(`${MANGADEX_API}/manga/${id}`);
        const tags = mangaRes.data.data.attributes.tags.slice(0, 3).map(t => t.id);
        
        if (tags.length === 0) return res.json({ status: "success", data: [] });

        let url = `${MANGADEX_API}/manga?limit=10&includes[]=cover_art`;
        tags.forEach(t => url += `&includedTags[]=${t}`);
        ['safe', 'suggestive'].forEach(r => url += `&contentRating[]=${r}`);

        const response = await axios.get(url);
        const related = response.data.data
            .filter(m => m.id !== id)
            .map(m => {
                const coverRel = m.relationships.find(r => r.type === 'cover_art');
                const fileName = coverRel ? coverRel.attributes?.fileName : null;
                const originalUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : null;
                return {
                    id: m.id,
                    title: getTitle(m.attributes),
                    coverUrl: proxyImg(originalUrl)
                };
            });
        res.json({ status: "success", data: related });
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
    const { quality } = req.query; // 'high' or 'low'
    try {
        const response = await axios.get(`${MANGADEX_API}/at-home/server/${id}`, { timeout: 15000 });
        const { baseUrl, chapter } = response.data;
        
        // Pilih data saver jika quality = low
        const isLow = quality === 'low';
        const useDataSaver = isLow && chapter.dataSaver && chapter.dataSaver.length > 0;
        
        const imgList = useDataSaver ? chapter.dataSaver : chapter.data;
        const subPath = useDataSaver ? 'data-saver' : 'data';
        
        const images = imgList.map(img => {
            const originalUrl = `${baseUrl}/${subPath}/${chapter.hash}/${img}`;
            return proxyImg(originalUrl);
        });
        res.json({ status: "success", data: images });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

// === KOMIKU SCRAPER (INDONESIA) ===

app.get('/api/komiku/popular', async (req, res) => {
    try {
        const url = `${KOMIKU_API}/manga/?orderby=meta_value_num`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        const mangaList = [];

        $('.bge').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const link = $(el).find('a').attr('href');
            if (!link) return;
            const id = link.split('/manga/')[1].replace('/', '');
            const coverUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            
            mangaList.push({
                id: id,
                title: title,
                coverUrl: proxyImg(coverUrl),
                source: 'komiku'
            });
        });

        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/komiku/latest', async (req, res) => {
    try {
        const url = `${KOMIKU_API}/manga/?orderby=modified`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        const mangaList = [];

        $('.bge').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const link = $(el).find('a').attr('href');
            if (!link) return;
            const id = link.split('/manga/')[1].replace('/', '');
            const coverUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            
            mangaList.push({
                id: id,
                title: title,
                coverUrl: proxyImg(coverUrl),
                source: 'komiku'
            });
        });

        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/komiku/search', async (req, res) => {
    const { q } = req.query;
    try {
        const url = `${KOMIKU_API}/manga/?s=${encodeURIComponent(q)}`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        const mangaList = [];

        $('.bge').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const link = $(el).find('a').attr('href');
            if (!link) return;
            const id = link.split('/manga/')[1].replace('/', '');
            const coverUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            
            mangaList.push({
                id: id,
                title: title,
                coverUrl: proxyImg(coverUrl),
                source: 'komiku'
            });
        });

        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/komiku/manga/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const url = `${KOMIKU_BASE}/manga/${id}/`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);

        const title = $('#Judul h1').text().replace('Komik', '').trim();
        const description = $('#Sinopsis').text().trim() || $('.desc').text().trim();
        const coverUrl = $('.ims img').attr('src');
        
        const chapters = [];
        $('.judulseries a').each((i, el) => {
            const chLink = $(el).attr('href');
            if (chLink) {
                // Link bisa berupa /chapter-slug/ atau https://komiku.org/chapter-slug/
                const chId = chLink.replace(KOMIKU_BASE, '').replace(/\//g, '');
                const chNum = $(el).find('b').text().replace('Chapter', '').trim();
                chapters.push({
                    id: chId,
                    chapter: chNum,
                    title: `Chapter ${chNum}`,
                    language: 'id'
                });
            }
        });

        const detail = {
            id: id,
            title: title,
            description: description,
            coverUrl: proxyImg(coverUrl),
            chapters: chapters, // Urutan asli terbaru di atas
            source: 'komiku'
        };
        res.json({ status: "success", data: detail });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/komiku/chapter/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const url = `${KOMIKU_BASE}/${id}/`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        const images = [];

        $('#Baca_Komik img').each((i, el) => {
            const imgUrl = $(el).attr('src');
            if (imgUrl) images.push(proxyImg(imgUrl.trim()));
        });

        res.json({ status: "success", data: images });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
module.exports = app;
