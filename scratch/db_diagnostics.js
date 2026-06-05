const pool = require('../db');

async function runDiagnostics() {
    try {
        console.log('--- Database Connection Check ---');
        const start = Date.now();
        const timeRes = await pool.query('SELECT NOW()');
        const latency = Date.now() - start;
        console.log(`Connection successful. Ping Latency: ${latency}ms`);
        console.log(`DB Server Time: ${timeRes.rows[0].now}`);

        console.log('\n--- Checking Tables ---');
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        console.log('Tables in database:', tablesRes.rows.map(r => r.table_name).join(', '));

        console.log('\n--- Checking Views ---');
        const viewsRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        console.log('Views in database:', viewsRes.rows.map(r => r.table_name).join(', '));

        console.log('\n--- Checking Foreign Key Columns & Missing Indexes ---');
        // Let's find columns that end with _id or are foreign keys, and check if they have indexes.
        const indexCheckRes = await pool.query(`
            SELECT 
                tc.table_name, 
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
        `);

        const fks = indexCheckRes.rows;
        console.log(`Found ${fks.length} foreign key constraints.`);

        for (const fk of fks) {
            // Check if there is an index on table_name where column_name is the first key
            const hasIndexRes = await pool.query(`
                SELECT 1
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                WHERE t.relkind = 'r'
                  AND t.relname = $1
                  AND a.attname = $2;
            `, [fk.table_name, fk.column_name]);

            const hasIndex = hasIndexRes.rows.length > 0;
            console.log(`Table: ${fk.table_name.padEnd(20)} | Column: ${fk.column_name.padEnd(20)} | Indexed: ${hasIndex ? 'YES' : 'NO (MISSING!)'}`);
        }

        console.log('\n--- Checking Indexes on Key Tables ---');
        const allIndexes = await pool.query(`
            SELECT tablename, indexname, indexdef 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            ORDER BY tablename, indexname;
        `);
        for (const idx of allIndexes.rows) {
            console.log(`- ${idx.tablename}.${idx.indexname}: ${idx.indexdef}`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error running diagnostics:', err);
        process.exit(1);
    }
}

runDiagnostics();
