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
    destination: path.join(__dirname, 'fileHandling', 'uploads', 'machineOutern'),
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });


const getMachineOuternController = async (req, res) => {

    try {
        
        const machineOuternLocation =  path.join(__dirname, 'fileHandling', 'uploads', 'machineOutern');
        const imageLinks = await getImagesMiddleware(machineOuternLocation, 'imageURL/machineOutern/');

        if (Array.isArray(imageLinks)) {
            dataFound(res, imageLinks)
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res)
    }
}

const MachineOuternControll = async (req, res) => {
    const uploadsDir = path.join(__dirname, 'fileHandling', 'uploads', 'machineOutern');
    
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
    MachineOuternControll,
    getMachineOuternController,
};
