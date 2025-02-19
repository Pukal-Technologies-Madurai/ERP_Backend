import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const domain = process.env.domain;

const getImage = (folder, image) => {
    if (!folder || !image) {
        return domain + 'imageURL/imageNotFound';
    }

    const defaultImageUrl = domain + 'imageURL/imageNotFound';
    const imageUrl = domain + 'imageURL/' + folder + '/' + image;
    const imagePath = path.join(__dirname, '..', 'uploads', folder, image);

    return fs.existsSync(imagePath) ? imageUrl : defaultImageUrl;
};

export default getImage;
