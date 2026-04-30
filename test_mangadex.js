const axios = require('axios');

async function checkDirect() {
    try {
        const url1 = 'https://api.mangadex.org/manga?limit=5&includedTags[]=391b0423-db2a-4b90-b076-581e053926bd';
        const res1 = await axios.get(url1);
        console.log(`URL 1 (includedTags[]=uuid): ${res1.data.data.length} items`);

        const url2 = 'https://api.mangadex.org/manga?limit=5&includedTags=391b0423-db2a-4b90-b076-581e053926bd';
        const res2 = await axios.get(url2);
        console.log(`URL 2 (includedTags=uuid): ${res2.data.data.length} items`);
    } catch (err) {
        console.error("Error direct:", err.message);
    }
}

checkDirect();
