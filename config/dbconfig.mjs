import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

export const connectDB = () => {

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

    sql.connect(config)
        .then(() => console.log("Connected Successfully ✔"))
        .catch(err => console.log("DB Connection Error:", err));
};