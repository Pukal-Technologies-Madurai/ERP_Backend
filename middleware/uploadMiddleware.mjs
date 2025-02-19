import multer from 'multer';
import fs from 'fs'
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadFile = (req, res, uploadLocation, key) => {
    const folders = ['products', 'retailers', 'attendance', 'visitLogs', 'forumDocuments'];
    const uploadDir = path.join(__dirname, '..', 'uploads', String(folders[Number(uploadLocation)]));

    const ensureUploadDirExists = (dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    };

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            ensureUploadDirExists(uploadDir);
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            const fileName = new Date().toISOString().replace(/:/g, '-') + "_" + file.originalname;
            cb(null, fileName);
        },
    });

    const upload = multer({ storage: storage }).single(key);

    return new Promise((resolve, reject) => {
        upload(req, res, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
} 

export default uploadFile;