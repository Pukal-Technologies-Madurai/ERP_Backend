import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

let commonPool;

export const connectDB = async() => {

    const config = {
        server: process.env.SERVER,
        instanceName: process.env.INSTANCE,
        port: Number(process.env.DB_PORT),
        driver: "SQL Server",
        database: process.env.DATABASE,
        user: process.env.USER,
        password: process.env.PASSWORD,
        connectionTimeout: 300000,
        requestTimeout: 300000,
        options: {
            // encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            // requestTimeout: 60000,
        },

    };
     try {
        // sql.connect() sets the GLOBAL pool — existing bare `new sql.Request()`
        // calls everywhere else in the app keep working exactly as before.
        await sql.connect(config);
        console.log("Connected Successfully ✔");
    } catch (err) {
        console.log("DB Connection Error:", err);
        throw err;
    }

    // sql.connect(config)
    //     .then(() => console.log("Connected Successfully ✔"))
    //     .catch(err => console.log("DB Connection Error:", err));
};

export const connectDB2 = async () => {
    if (commonPool?.connected) return commonPool;

    const config = {
        server: process.env.COMMON_SERVER,
        port: Number(process.env.COMMON_DB_PORT || process.env.DB_PORT),
        driver: "SQL Server",
        database: process.env.COMMON_USERPORTALDB,
        user: process.env.COMMON_USER,
        password: process.env.COMMON_SERVER_PASSWORD,
        connectionTimeout: 300000,
        requestTimeout: 300000,
        options: {
            trustServerCertificate: true,
            enableArithAbort: true,
        },
    };

    try {
        commonPool = await new sql.ConnectionPool(config).connect();
        console.log("Connected to common DB Successfully ✔");
        return commonPool;
    } catch (err) {
        console.log("Common DB Connection Error:", err);
        throw err;
    }
};