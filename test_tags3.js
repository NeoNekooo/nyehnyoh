const axios = require('axios');

async function test() {
    try {
        const MANGADEX_API = 'https://api.mangadex.org';
        const GENRES = {
            'Action': '391b0423-db2a-4b90-b076-581e053926bd',
            'Romance': '423e2eae-9ee6-4a4a-9561-1befed322c59'
        };

        const ratings = ['safe', 'suggestive'];
        
        const params = {
            limit: 5,
            includes: ['cover_art'],
            'order[followedCount]': 'desc',
            contentRating: ratings
        };
        params.includedTags = [GENRES['Action']];

        const res1 = await axios.get(`${MANGADEX_API}/manga`, { params });
        console.log(`Action test: ${res1.data.data.length} items`);
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
test();
