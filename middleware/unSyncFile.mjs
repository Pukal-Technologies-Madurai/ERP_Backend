// import fs from 'fs/promises';

// const fileRemoverMiddleware = async (filePath) => {
//   return new Promise((resolve, reject) => {
//     fs.access(filePath, fs.constants.F_OK, (err) => {
//       if (err) {
//         resolve();
//       } else {
//         fs.unlink(filePath, (err) => {
//           if (err) {
//             reject(err);
//           } else {
//             resolve();
//           }
//         });
//       }
//     });
//   });
// };

// export default fileRemoverMiddleware;

import fs from 'fs/promises';

const fileRemoverMiddleware = async (filePath) => {
    try {
        await fs.access(filePath);
        
        await fs.unlink(filePath);
        console.log(`File deleted: ${filePath}`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`File not found: ${filePath}`);
            return;
        }
        throw err;
    }
};

export default fileRemoverMiddleware;

