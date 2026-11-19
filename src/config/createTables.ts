import pool from "./database";
import fs from "fs";
import path from "path";

const createTables = async () => {
    try {
        const schemaPath = path.join(__dirname, "schema.sql");
        const schema = fs.readFileSync(schemaPath, "utf-8");

        await pool.query(schema);

        console.log("Database tables created successfully!");
    } catch (error) {
        console.error("Table creation failed:", error);
    } finally {
        await pool.end();
    }
};

createTables();