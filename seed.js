const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://manganya_db:Tl2NcAufyJrBuU6T@cluster0.x7iu4xb.mongodb.net/manganyan?retryWrites=true&w=majority';

// Model Frame (Langsung)
const FrameSchema = new mongoose.Schema({ name: String, imageUrl: String });
const Frame = mongoose.model('Frame', FrameSchema);

const seedFrames = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connecting to fix frames...');

        // Hapus yang lama biar nggak dobel dan bersih dari 404
        await Frame.deleteMany({});

        const frames = [
            { name: "Neon Cyber (Rare)", imageUrl: "https://i.postimg.cc/kXy0tW9x/neon-frame.png" },
            { name: "Golden King (Legendary)", imageUrl: "https://i.postimg.cc/q7SjH9V0/gold-frame.png" },
            { name: "Sakura Blossom (Rare)", imageUrl: "https://i.postimg.cc/mD3f4p6f/sakura-frame.png" },
            { name: "Void Purple (Epic)", imageUrl: "https://i.postimg.cc/7Z9YyX3y/purple-frame.png" },
            { name: "Fire Spirit (Epic)", imageUrl: "https://i.postimg.cc/520mK7L8/fire-frame.png" }
        ];

        await Frame.insertMany(frames);
        console.log('FRAME BERHASIL DIPERBAIKI! Sekarang semua link aktif.');
        process.exit();
    } catch (error) {
        console.error('Gagal seeding frame:', error);
        process.exit(1);
    }
};

seedFrames();
