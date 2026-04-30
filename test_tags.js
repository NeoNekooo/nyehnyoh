const axios = require('axios');

async function test() {
    try {
        console.log("Testing popular with Action tag...");
        const res1 = await axios.get('https://nyehnyoh.vercel.app/api/manga/popular?tag=Action');
        console.log(`Popular Action: ${res1.data.data.length} items`);
        console.log("Titles:", res1.data.data.map(m => m.title).slice(0, 3));

        console.log("Testing latest with Romance tag...");
        const res2 = await axios.get('https://nyehnyoh.vercel.app/api/manga/latest?tag=Romance');
        console.log(`Latest Romance: ${res2.data.data.length} items`);
        console.log("Titles:", res2.data.data.map(m => m.title).slice(0, 3));
    } catch (e) {
        console.error(e.message);
    }
}
test();
