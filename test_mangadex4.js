const axios = require('axios');
const https = require('https');

async function checkDirect() {
    try {
        const agent = new https.Agent({ rejectUnauthorized: false });
        const url1 = 'https://api.mangadex.org/manga?limit=5&includedTags[]=391b0423-db2a-4b90-b076-581e053926bd';
        const res1 = await axios.get(url1, { httpsAgent: agent });
        console.log(JSON.stringify(res1.data, null, 2));
    } catch (err) {
        console.error("Error response:", err.message);
    }
}

checkDirect();
