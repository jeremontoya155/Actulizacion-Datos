// Cargar las variables del archivo .env
require('dotenv').config();

const mysql = require('mysql2');
const { Pool } = require('pg');

// Conexión a la base de datos MySQL (Plex Replica Ext)
const originalDB = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000  // Tiempo de espera para la conexión
});

// Conexión a la base de datos PostgreSQL (Railway)
const replicaDB = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

module.exports = { originalDB, replicaDB };
