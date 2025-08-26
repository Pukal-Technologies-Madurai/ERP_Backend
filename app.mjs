import express from 'express'
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import indexRouter from './routes/index.mjs';
import morgan from 'morgan';
import fs from 'fs';
import { connectDB } from './config/dbconfig.mjs';
import dotenv from 'dotenv';
import { listRoutes } from './middleware/apiList.mjs';
import { failed } from './res.mjs';
import { staticPaths } from './staticPaths.mjs'
import crypto from "node:crypto";

dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.locals.requestId = crypto.randomUUID();
  res.locals.startedAt = process.hrtime.bigint();
  next();
});


const logStream = fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' });
app.use(morgan('dev', { stream: logStream }));

connectDB();

app.use('/api', indexRouter);

app.use('/api', (req, res) => {
    try {
        return listRoutes(app, res)
    } catch (e) {
        console.error(e);
        return failed(res, 'Failed to list routes')
    }
})

const reactBuildPath = path.join(__dirname, 'frontend');
app.use(express.static(reactBuildPath));

staticPaths.forEach(({ route, folder }) => {
    const resolvedPath = path.join(__dirname, folder);
    app.use(route, express.static(resolvedPath));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(reactBuildPath, 'index.html'));
});

const PORT = process.env.PORT || 9001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});