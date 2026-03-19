const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'collection.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  } else {
    console.log('✅ Connected to database');
    runMigrations();
  }
});

function runMigrations() {
  db.serialize(() => {
    // Check if columns exist
    db.all('PRAGMA table_info(cards)', (err, columns) => {
      if (err) {
        console.error('❌ Error checking table schema:', err);
        process.exit(1);
      }

      const hasBinderName = columns.some(col => col.name === 'binder_name');
      const hasBinderType = columns.some(col => col.name === 'binder_type');

      if (!hasBinderName) {
        console.log('🔧 Adding binder_name column...');
        db.run('ALTER TABLE cards ADD COLUMN binder_name TEXT', (err) => {
          if (err) console.error('❌ Error adding binder_name:', err);
          else console.log('✅ Added binder_name column');
        });
      }

      if (!hasBinderType) {
        console.log('🔧 Adding binder_type column...');
        db.run('ALTER TABLE cards ADD COLUMN binder_type TEXT', (err) => {
          if (err) console.error('❌ Error adding binder_type:', err);
          else console.log('✅ Added binder_type column');
        });
      }

      if (hasBinderName && hasBinderType) {
        console.log('✅ Database schema is up to date');
      }

      db.close((err) => {
        if (err) console.error('❌ Error closing database:', err);
        else console.log('✅ Migration complete');
      });
    });
  });
}
