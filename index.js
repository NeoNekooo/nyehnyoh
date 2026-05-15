const express = require('express');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const cors = require('cors');
const mongoose = require('mongoose');
const Parser = require('rss-parser');
const parser = new Parser();

const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    },
    timeout: 10000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
});
const NodeCache = require('node-cache');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const PORT = process.env.PORT || 3000;
// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://manganya_db:Tl2NcAufyJrBuU6T@cluster0.x7iu4xb.mongodb.net/manganyan?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
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
    coins: { type: Number, default: 0 },
    frame: { type: mongoose.Schema.Types.ObjectId, ref: 'Frame', default: null },
    unlockedFrames: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Frame' }]
});
const User = mongoose.model('User', UserSchema);

const CommentSchema = new mongoose.Schema({
    mangaId: String,
    chapterId: String,
    username: String,
    avatar: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
});
const Comment = mongoose.model('Comment', CommentSchema);

const NewsSchema = new mongoose.Schema({
    title: String,
    description: String,
    imageUrl: String,
    url: String,
    date: { type: Date, default: Date.now }
});
const News = mongoose.model('News', NewsSchema);

const HistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mangaId: String,
    mangaTitle: String,
    mangaCover: String,
    chapterId: String,
    chapterTitle: String,
    genres: [String],
    timestamp: { type: Date, default: Date.now }
});
const History = mongoose.model('History', HistorySchema);

app.use(cors());
app.use(express.json());

const MANGADEX_API = 'https://api.mangadex.org';
const KOMIKU_BASE = 'https://komiku.org';
const KOMIKU_API = 'https://api.komiku.org';
const KIRYUU_BASE = 'https://kiryuu.id';
const WESTMANGA_BASE = 'https://westmanga.info';
const DOUJINDESU_BASE = 'https://doujindesu.tv';
const MANGANATO_BASE = 'https://manganato.com';
const KOMIKCAST_BASE = 'https://komikcast.bz'; // Kita simpen komikcast sebagai cadangan atau hapus (sesuai Big 6)

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
        console.log(`[LOGIN ATTEMPT] User: ${username}`);
        const user = await User.findOne({ username, password }).populate('frame');
        if (!user) {
            console.log(`[LOGIN FAILED] User: ${username}`);
            return res.status(401).json({ status: "error", message: "Login gagal" });
        }
        console.log(`[LOGIN SUCCESS] User: ${username}`);
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
app.post('/api/user/add-coins', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const user = await User.findByIdAndUpdate(userId, { $inc: { coins: amount } }, { new: true });
        res.json({ status: "success", data: user });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/gacha/pull', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (user.coins < 50) return res.status(400).json({ status: "error", message: "Koin tidak cukup (Butuh 50 koin)" });

        const frames = await Frame.find();
        if (frames.length === 0) return res.status(400).json({ status: "error", message: "Belum ada frame di sistem" });

        const randomFrame = frames[Math.floor(Math.random() * frames.length)];
        
        user.coins -= 50;
        if (!user.unlockedFrames.includes(randomFrame._id)) {
            user.unlockedFrames.push(randomFrame._id);
        }
        await user.save();
        
        res.json({ status: "success", data: randomFrame, user: user });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/comments/:chapterId', async (req, res) => {
    try {
        const comments = await Comment.find({ chapterId: req.params.chapterId }).sort({ timestamp: -1 }).limit(50);
        res.json({ status: "success", data: comments });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/comments', async (req, res) => {
    try {
        const { mangaId, chapterId, username, avatar, text } = req.body;
        const newComment = new Comment({ mangaId, chapterId, username, avatar, text });
        await newComment.save();
        res.json({ status: "success", data: newComment });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/api/news', async (req, res) => {
    const cacheKey = 'manga_news_live';
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.json({ status: "success", data: cachedData });

    try {
        const feed = await Promise.race([
            parser.parseURL('https://www.animenewsnetwork.com/news/rss.xml'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        
        const liveNews = feed.items.map(item => {
            let imageUrl = "https://img.icons8.com/clouds/200/news.png";
            const imgMatch = (item.content || item.description || "").match(/src="([^"]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];

            return {
                title: item.title,
                description: item.contentSnippet || item.description,
                imageUrl: imageUrl,
                url: item.link,
                date: item.pubDate
            };
        });

        cache.set(cacheKey, liveNews.slice(0, 20));
        res.json({ status: "success", data: liveNews.slice(0, 20) });
    } catch (error) {
        console.error('Scraper Error:', error.message);
        // Kalau macet, ambil dari database sebagai cadangan
        try {
            const news = await News.find().sort({ date: -1 }).limit(20);
            res.json({ status: "success", data: news });
        } catch (dbError) {
            res.json({ status: "success", data: [] });
        }
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

// --- REALTIME & EXTERNAL SYNC ---

// MyAnimeList Importer (Pake Jikan API)
app.get('/api/mal/import/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const response = await axios.get(`https://api.jikan.moe/v4/users/${username}/mangalist`);
        
        const mangaList = response.data.data.map(item => ({
            title: item.manga.title,
            malId: item.manga.mal_id,
            imageUrl: item.manga.images.jpg.image_url,
            status: item.reading_status
        }));

        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: "Gagal impor dari MAL. Cek username kamu bre!" });
    }
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log('User connected to Realtime Hub: ' + socket.id);
    
    socket.on('subscribe_updates', (mangaIds) => {
        mangaIds.forEach(id => socket.join(`manga_${id}`));
        console.log(`User subscribed to updates for ${mangaIds.length} manga`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Helper buat broadcast notif (bisa dipanggil dari rute mana aja)
const broadcastNotification = (type, data) => {
    io.emit('notification', { type, data, timestamp: new Date() });
};

// Override popular manga buat simulasi notif update (Hanya buat testing)
app.get('/api/manga/broadcast-test', (req, res) => {
    broadcastNotification('UPDATE', { title: 'Solo Leveling', chapter: '179' });
    res.send('Notif terkirim ke semua user!');
});

// Simpan Riwayat ke Cloud
app.post('/api/history', async (req, res) => {
    try {
        const { userId, mangaId, mangaTitle, mangaCover, chapterId, chapterTitle, genres } = req.body;
        const history = new History({ userId, mangaId, mangaTitle, mangaCover, chapterId, chapterTitle, genres });
        await history.save();
        res.json({ status: "success", message: "History saved to cloud" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

// Ambil Statistik User
app.get('/api/user/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const history = await History.find({ userId });
        
        // Hitung total chapter
        const totalChapters = history.length;
        
        // Hitung genre favorit
        const genreMap = {};
        history.forEach(h => {
            h.genres.forEach(g => {
                genreMap[g] = (genreMap[g] || 0) + 1;
            });
        });
        
        const topGenres = Object.entries(genreMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);

        res.json({ 
            status: "success", 
            data: {
                totalChapters,
                topGenres,
                readingDays: new Set(history.map(h => h.timestamp.toISOString().split('T')[0])).size
            }
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

// Mock AI Recommendation
app.post('/api/ai/recommend', async (req, res) => {
    const { title, genres } = req.body;
    // Di sini nantinya bisa panggil Gemini API
    // Untuk sekarang kita kasih simulasi logic AI
    const recommendations = [
        { title: "Manga Serupa 1", reason: "AI mendeteksi kesamaan tema Action dan Artstyle." },
        { title: "Manga Serupa 2", reason: "Berdasarkan genre " + (genres[0] || "Manga") + " yang kamu suka." }
    ];
    res.json({ status: "success", data: recommendations });
});
app.get('/api/admin/seed', async (req, res) => {
    try {
        await Frame.deleteMany({});
        const frames = [
            { name: "Golden Elite (Legendary)", imageUrl: "https://img.icons8.com/clouds/200/gold-bars.png" },
            { name: "Cyber Neon (Rare)", imageUrl: "https://img.icons8.com/clouds/200/light-switch.png" },
            { name: "Sakura Blossom (Rare)", imageUrl: "https://img.icons8.com/clouds/200/cherry-blossoms.png" },
            { name: "Void Purple (Epic)", imageUrl: "https://img.icons8.com/clouds/200/vortex.png" },
            { name: "Flame Spirit (Epic)", imageUrl: "https://img.icons8.com/clouds/200/fire-element.png" }
        ];
        await Frame.insertMany(frames);
        res.send("<h1>SULTAN SEEDING SUKSES BRE!</h1><p>Koleksi Frame Elit sudah masuk ke database. Sekarang silakan cek aplikasinya.</p>");
    } catch (error) {
        res.status(500).send("Gagal seeding: " + error.message);
    }
});

// === GENERIC SOURCE SYSTEM (KIRYUU, WESTMANGA, KOMIKCAST) ===

const getSourceConfig = (source) => {
    switch (source) {
        case 'kiryuu': return { base: KIRYUU_BASE, latestPath: '/manga/?orderby=modified', popularPath: '/manga/?orderby=popular' };
        case 'westmanga': return { base: WESTMANGA_BASE, latestPath: '/manga/?orderby=modified', popularPath: '/manga/?orderby=popular' };
        case 'manganato': return { base: MANGANATO_BASE, latestPath: '/index.php', popularPath: '/index.php' };
        case 'doujindesu': return { base: DOUJINDESU_BASE, latestPath: '/', popularPath: '/manga/?orderby=popular' };
        case 'komikcast': return { base: KOMIKCAST_BASE, latestPath: '/daftar-komik/?orderby=modified', popularPath: '/daftar-komik/?orderby=popular' };
        default: return null;
    }
};

const handleGenericLatest = async (req, res, source) => {
    try {
        const config = getSourceConfig(source);
        const { tag } = req.query;
        
        let url = `${config.base}${config.latestPath}`;
        // Jika ada tag/genre, ubah jalurnya (beberapa web pake pola /genre/nama-genre/)
        if (tag) {
            const genreSlug = tag.toLowerCase().replace(/\s+/g, '-');
            url = `${config.base}/genre/${genreSlug}/?orderby=modified`;
        }

        const response = await axiosInstance.get(url, {
            headers: { 'Referer': config.base }
        });
        const $ = cheerio.load(response.data);
        const mangaList = [];

        $('.listupd .bs, .listo .bs, .bge, .utao, .uta, .imgu, .bsx, .animposx, .content-homepage-item').each((i, el) => {
            const title = $(el).find('h3, .tt, .judul, .item-title, h4').first().text().trim();
            let link = $(el).find('a').first().attr('href');
            if (!link) return;

            // Handle relative links
            if (link.startsWith('/')) link = config.base + link;

            let id = '';
            if (link.includes('manganato.com/')) id = link.split('manganato.com/')[1].replace(/\//g, '');
            else if (link.includes('/manga/')) id = link.split('/manga/')[1].split('?')[0].replace(/\//g, '');
            else if (link.includes('/komik/')) id = link.split('/komik/')[1].split('?')[0].replace(/\//g, '');
            
            const coverUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || $(el).find('img').attr('data-lazy-src');
            
            if (id && title) {
                mangaList.push({ id, title, coverUrl: proxyImg(coverUrl), source });
            }
        });
        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const handleGenericSearch = async (req, res, source) => {
    try {
        const config = getSourceConfig(source);
        const url = `${config.base}/?s=${encodeURIComponent(req.query.q)}`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        const mangaList = [];

        $('.listupd .bs, .listo .bs, .bge, .utao, .uta, .imgu, .bsx').each((i, el) => {
            const title = $(el).find('h3, .tt, .judul').text().trim();
            const link = $(el).find('a').attr('href');
            if (!link) return;

            let id = '';
            if (link.includes('/manga/')) id = link.split('/manga/')[1].replace(/\//g, '');
            else if (link.includes('/komik/')) id = link.split('/komik/')[1].replace(/\//g, '');
            else if (link.includes('/mangas/')) id = link.split('/mangas/')[1].replace(/\//g, '');
            
            const coverUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || $(el).find('img').attr('data-lazy-src');
            
            if (id && title) {
                mangaList.push({ id, title, coverUrl: proxyImg(coverUrl), source });
            }
        });
        res.json({ status: "success", data: mangaList });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const handleGenericDetail = async (req, res, source) => {
    try {
        const config = getSourceConfig(source);
        const url = `${config.base}/manga/${req.params.id}/`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);

        const title = $('.entry-title, .judul h1, .postbody h1').first().text().trim();
        const description = $('.entry-content p, .sinopsis p, .desc, .summary').text().trim();
        const coverUrl = $('.thumb img, .ims img, .ime img').first().attr('src') || $('.thumb img, .ims img, .ime img').first().attr('data-src');
        
        const chapters = [];
        $('.clndr a, #chapterlist a, .judulseries a').each((i, el) => {
            const chLink = $(el).attr('href');
            if (chLink) {
                let chId = '';
                if (chLink.includes('/chapter/')) chId = chLink.split('/chapter/')[1].replace(/\//g, '');
                else chId = chLink.replace(config.base, '').replace(/\//g, '');

                const chNum = $(el).find('.chapternum, .ch-num, b').text().replace('Chapter', '').trim() || `Ch.${i+1}`;
                if (chId) {
                    chapters.push({ 
                        id: chId, 
                        chapter: chNum, 
                        title: `Chapter ${chNum}`, 
                        language: 'id' 
                    });
                }
            }
        });
        res.json({ status: "success", data: { id: req.params.id, title, description, coverUrl: proxyImg(coverUrl), chapters, source } });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const handleGenericChapter = async (req, res, source) => {
    try {
        const config = getSourceConfig(source);
        const url = `${config.base}/${req.params.id}/`;
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        const images = [];

        $('#readerarea img').each((i, el) => {
            const imgUrl = $(el).attr('src') || $(el).attr('data-src');
            if (imgUrl && !imgUrl.includes('ads')) images.push(proxyImg(imgUrl));
        });
        res.json({ status: "success", data: images });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

// Route Registration
[
    'kiryuu', 'westmanga', 'manganato', 'doujindesu', 'komikcast'
].forEach(src => {
    app.get(`/api/${src}/latest`, (req, res) => handleGenericLatest(req, res, src));
    app.get(`/api/${src}/popular`, (req, res) => handleGenericLatest(req, res, src)); // Popular patternnya mirip buat awal
    app.get(`/api/${src}/search`, (req, res) => handleGenericSearch(req, res, src));
    app.get(`/api/${src}/manga/:id`, (req, res) => handleGenericDetail(req, res, src));
    app.get(`/api/${src}/chapter/:id`, (req, res) => handleGenericChapter(req, res, src));
});

http.listen(PORT, () => {
    console.log(`Realtime Server running on port ${PORT}`);
});
module.exports = app;
