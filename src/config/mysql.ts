import mysql from 'mysql2/promise';

export const dbRequest = async (query: string, params: any[] = []) => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const [results] = await connection.execute(query, params);
        return results;
    } finally {
        await connection.end();
    }
};

export const initDb = async () => {
    // Create verification_codes table if not exists
    await dbRequest(`
        CREATE TABLE IF NOT EXISTS verification_codes (
            code VARCHAR(10) PRIMARY KEY,
            discord_id VARCHAR(255) NOT NULL,
            discord_username VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Tabla verification_codes verificada.');
};
