import mysql from 'mysql2/promise';

export const cpRequest = async (query: string, params: any[] = []) => {
    const connection = await mysql.createConnection({
        host: process.env.CP_DB_HOST,
        port: Number(process.env.CP_DB_PORT) || 3306,
        user: process.env.CP_DB_USER,
        password: process.env.CP_DB_PASSWORD,
        database: process.env.CP_DB_NAME
    });

    try {
        const [results] = await connection.execute(query, params);
        return results;
    } finally {
        await connection.end();
    }
};
