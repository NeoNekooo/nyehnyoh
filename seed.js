const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://manganya_db:Tl2NcAufyJrBuU6T@cluster0.x7iu4xb.mongodb.net/manganyan?retryWrites=true&w=majority';

const FrameSchema = new mongoose.Schema({ name: String, imageUrl: String });
const Frame = mongoose.model('Frame', FrameSchema);

const seedFrames = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connecting to fix frames with STABLE icons...');

        await Frame.deleteMany({});

        const frames = [
            { name: "Golden Elite (Legendary)", imageUrl: "https://img.icons8.com/clouds/200/gold-bars.png" },
            { name: "Cyber Neon (Rare)", imageUrl: "https://img.icons8.com/clouds/200/light-switch.png" },
            { name: "Sakura Blossom (Rare)", imageUrl: "https://img.icons8.com/clouds/200/cherry-blossoms.png" },
            { name: "Void Purple (Epic)", imageUrl: "https://img.icons8.com/clouds/200/vortex.png" },
            { name: "Flame Spirit (Epic)", imageUrl: "https://img.icons8.com/clouds/200/fire-element.png" }
        ];

        await Frame.insertMany(frames);
        console.log('FRAME BERHASIL DIPERBAIKI PAKE ICONS8! Dijamin nongol.');
        process.exit();
    } catch (error) {
        console.error('Gagal seeding frame:', error);
        process.exit(1);
    }
};

seedFrames();
