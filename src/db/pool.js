import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import {
  DATABASE_CONNECT_TIMEOUT_MS,
  DATABASE_CONNECTION_LIMIT,
} from "../config/constants.js";

export const databaseConfig = Object.freeze({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
  waitForConnections: true,
  connectionLimit: DATABASE_CONNECTION_LIMIT,
  queueLimit: 0,
  connectTimeout: DATABASE_CONNECT_TIMEOUT_MS,
  timezone: "+00:00",
  charset: "utf8mb4",
});

export const pool = mysql.createPool(databaseConfig);
