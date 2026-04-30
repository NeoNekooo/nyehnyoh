const axios = require('axios');
const https = require('https');

async function checkDirect() {
    try {
        const agent = new https.Agent({ rejectUnauthorized: false });

        const url1 = 'https://api.mangadex.org/manga?limit=5&includedTags[]=391b0423-db2a-4b90-b076-581e053926bd';
        const res1 = await axios.get(url1, { httpsAgent: agent });
        console.log(`URL 1 (includedTags[]=uuid): ${res1.data.data.length} items`);

        const url2 = 'https://api.mangadex.org/manga?limit=5&includedTags=391b0423-db2a-4b90-b076-581e053926bd';
        const res2 = await axios.get(url2, { httpsAgent: agent });
        console.log(`URL 2 (includedTags=uuid): ${res2.data.data.length} items`);
        
        // Let's test Axios default serialization in 1.6.0
        const params = {
            limit: 5,
            includes: ['cover_art'],
            includedTags: ['391b0423-db2a-4b90-b076-581e053926bd']
        };
        const res3 = await axios.get('https://api.mangadex.org/manga', { params, httpsAgent: agent });
        console.log(`URL 3 (Axios default): ${res3.data.data.length} items`);
    } catch (err) {
        console.error("Error direct:", err.message);
    }
}

checkDirect();
