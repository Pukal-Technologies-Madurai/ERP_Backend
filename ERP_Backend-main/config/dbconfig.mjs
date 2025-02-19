import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

export const connectDB = () => {
  const config = {
    server: process.env.SERVER,
    database: process.env.DATABASE,
    driver: "SQL Server",
    user: process.env.USER,
    password: process.env.PASSWORD,
    stream: false,
    options: {
      trustedConnection: true,
      trustServerCertificate: true,
      requestTimeout: 60000,
    },
  };

  sql.connect(config, (err) => {
    if (err) {
      console.log(err);
    } else {
      console.log("connected Successfully -----");
    }
  })
};
