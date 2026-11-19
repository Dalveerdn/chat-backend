
import pool from "./database";

const seedUsers = async () => {
    try {
        await pool.query(`
            INSERT INTO users (name, email)
            VALUES
                ('User A', 'usera@test.com'),
                ('User B', 'userb@test.com')
            ON CONFLICT (email) DO NOTHING;
        `);

        const result = await pool.query(`
            SELECT id, name, email
            FROM users
            WHERE email IN ('usera@test.com', 'userb@test.com')
            ORDER BY email;
        `);

        console.log("Test users created/found:");
        console.log(result.rows);
    } catch (error) {
        console.error("Error seeding users:", error);
    } finally {
        await pool.end();
    }
};

seedUsers();
