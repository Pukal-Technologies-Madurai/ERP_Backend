import fs from 'fs/promises';
import path from 'path';

const copyImageMiddleware = async (srcDir, destDir, fileName) => {

    const oldPath = path.join(srcDir, fileName);
    const newPath = path.join(destDir, fileName);

    try {
        await fs.copyFile(oldPath, newPath);
        return newPath;
    } catch (error) {
        console.error(error);
        return null;
    }
};

export default copyImageMiddleware;