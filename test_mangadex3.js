const axios = require('axios');
const https = require('https');

async function checkDirect() {
    try {
        const agent = new https.Agent({ rejectUnauthorized: false });

        const url1 = 'https://api.mangadex.org/manga?limit=5&includedTags[]=391b0423-db2a-4b90-b076-581e053926bd';
        const res1 = await axios.get(url1, { httpsAgent: agent });
        console.log(`URL 1 (includedTags[]=uuid): ${res1.data.data.length} items`);

    } catch (err) {
        console.error("Error response:", JSON.stringify(err.response ? err.response.data : err.message, null, 2));
    }
}

checkDirect();
