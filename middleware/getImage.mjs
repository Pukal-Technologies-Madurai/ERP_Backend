import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const domain = process.env.DOMAIN; 

const isImageFile = (file) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
    const fileExtension = path.extname(file).toLowerCase();
    return imageExtensions.includes(fileExtension);
};

const getFileStats = (directoryPath, file, apiPath) => {
    return new Promise((resolve, reject) => {
        fs.stat(path.join(directoryPath, file), (err, stats) => {
            if (err) return reject(err);

            resolve({
                fileName: file,
                modifiedTime: stats.mtime,
                // allInformations: stats,
                url: `${domain + apiPath + file}`
            });
        });
    });
};

const getAllImagesFromDirectory = (directoryPath, apiPath) => {
    return new Promise((resolve, reject) => {
        fs.readdir(directoryPath, async (err, files) => {
            if (err) return reject(err);

            const imageFiles = files.filter(isImageFile);
            try {
                const fileStats = await Promise.all(imageFiles.map(file => getFileStats(directoryPath, file, apiPath)));
                resolve(fileStats);
            } catch (error) {
                reject(error);
            }
        });
    });
};

const getImagesMiddleware = async (directoryPath, apiPath) => {
    try {
        const images = await getAllImagesFromDirectory(directoryPath, apiPath);
        return images; 
    } catch (err) {
        console.log(err);
        return [];
    }
};

export default getImagesMiddleware;
