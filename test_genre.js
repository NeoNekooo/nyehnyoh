const axios = require('axios');

async function check() {
    try {
        console.log("Checking API...");
        const res = await axios.get('https://nyehnyoh.vercel.app/api/manga/popular?tag=Action', {timeout: 10000});
        console.log("Status:", res.status);
        console.log("Data length:", res.data?.data?.length);
    } catch (err) {
        console.error("Error:", err.message);
    }
}

check();
