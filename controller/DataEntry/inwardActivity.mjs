import multer from 'multer';
import path from 'path';
import { servError, dataFound, noData, success, failed } from '../../res.mjs';
import deleteAllFilesInDirectory from '../../middleware/deleteAllFIles.mjs';
import getImagesMiddleware from '../../middleware/getImage.mjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const storage = multer.diskStorage({
    destination: path.join(__dirname, 'fileHandling', 'uploads', 'inwardActivity'),
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });


const getInwardActivity = async (req, res) => {

    try {
        
        const machineOuternLocation =  path.join(__dirname, 'fileHandling', 'uploads', 'inwardActivity');
        const imageLinks = await getImagesMiddleware(machineOuternLocation, 'imageURL/inwardActivity/');

        if (Array.isArray(imageLinks)) {
            dataFound(res, imageLinks)
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res)
    }
}

const InwardActivityControll = async (req, res) => {
    const uploadsDir = path.join(__dirname, 'fileHandling', 'uploads', 'inwardActivity');
    
    try {
        await deleteAllFilesInDirectory(uploadsDir);

        upload.single('image')(req, res, (err) => {
            if (err) {
                return servError(err, res);
            }
            if (!req.file) {
                return failed(res, 'No file selected');
            }

            success(res, 'Image Uploaded');
        });

    } catch (e) {
        servError(e, res);
    }
}

export {
    getInwardActivity,
    InwardActivityControll,
};
