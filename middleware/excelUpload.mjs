import multer from "multer";


const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const isExcelOrCsv =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'text/csv' ||
            file.mimetype === 'application/csv' ||
            /\.(xlsx|xls|csv)$/i.test(file.originalname);

        if (isExcelOrCsv) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

export default upload;
