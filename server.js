const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'data', 'collection.db');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Multer config for CSV upload
const upload = multer({ dest: 'uploads/' });

// Initialize SQLite DB
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Database connected');
    initDB();
  }
});

function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      set_code TEXT,
      quantity INTEGER DEFAULT 1,
      foil INTEGER DEFAULT 0,
      condition TEXT DEFAULT 'NM',
      scryfall_id TEXT,
      image_uri TEXT,
      mana_cost TEXT,
      type_line TEXT,
      colors TEXT,
      rarity TEXT,
      price_usd REAL,
      price_eur REAL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating table:', err);
    else console.log('✅ Cards table ready');
  });
}

// Scryfall API helper
async function fetchCardData(cardName, setCode = null) {
  try {
    let url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`;
    if (setCode) url += `&set=${setCode}`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      scryfall_id: data.id,
      image_uri: data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || null,
      mana_cost: data.mana_cost || '',
      type_line: data.type_line || '',
      colors: data.colors?.join('') || '',
      rarity: data.rarity || '',
      price_usd: parseFloat(data.prices?.usd) || null,
      price_eur: parseFloat(data.prices?.eur) || null
    };
  } catch (error) {
    console.error(`Error fetching ${cardName}:`, error.message);
    return null;
  }
}

// API Routes

// Get all cards
app.get('/api/cards', (req, res) => {
  const { search, color, type, rarity, set } = req.query;
  let query = 'SELECT * FROM cards WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  if (color) {
    query += ' AND colors LIKE ?';
    params.push(`%${color}%`);
  }
  if (type) {
    query += ' AND type_line LIKE ?';
    params.push(`%${type}%`);
  }
  if (rarity) {
    query += ' AND rarity = ?';
    params.push(rarity);
  }
  if (set) {
    query += ' AND set_code = ?';
    params.push(set.toUpperCase());
  }

  query += ' ORDER BY name ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Get collection stats
app.get('/api/stats', (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as total_cards,
      SUM(quantity) as total_copies,
      SUM(price_eur * quantity) as total_value_eur,
      SUM(price_usd * quantity) as total_value_usd,
      SUM(CASE WHEN foil = 1 THEN quantity ELSE 0 END) as total_foils
    FROM cards
  `, (err, stats) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      db.all(`
        SELECT colors, SUM(quantity) as count 
        FROM cards 
        GROUP BY colors
      `, (err2, colorDist) => {
        if (err2) {
          res.status(500).json({ error: err2.message });
        } else {
          res.json({ ...stats, colorDistribution: colorDist });
        }
      });
    }
  });
});

// Fetch card by Scryfall ID
async function fetchCardByID(scryfallId) {
  try {
    const url = `https://api.scryfall.com/cards/${scryfallId}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      scryfall_id: data.id,
      image_uri: data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || null,
      mana_cost: data.mana_cost || '',
      type_line: data.type_line || '',
      colors: data.colors?.join('') || '',
      rarity: data.rarity || '',
      price_usd: parseFloat(data.prices?.usd) || null,
      price_eur: parseFloat(data.prices?.eur) || null
    };
  } catch (error) {
    console.error(`Error fetching card by ID ${scryfallId}:`, error.message);
    return null;
  }
}

// Upload CSV
app.post('/api/upload', upload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    let imported = 0;
    let failed = 0;

    // Detect format (Manabox vs simple)
    const isManabox = records.length > 0 && records[0]['Scryfall ID'];

    for (const record of records) {
      let name, setCode, quantity, foil, condition, scryfallId;

      if (isManabox) {
        // Manabox format
        name = record['Name'];
        setCode = record['Set code'];
        quantity = parseInt(record['Quantity'] || 1);
        foil = (record['Foil'] === 'foil' || record['Foil'] === 'true') ? 1 : 0;
        condition = record['Condition'] || 'NM';
        scryfallId = record['Scryfall ID'];
      } else {
        // Simple format
        name = record.nombre || record.name || record.Name;
        setCode = record.set || record.set_code || record['Set code'] || null;
        quantity = parseInt(record.cantidad || record.quantity || record.Quantity || 1);
        foil = (record.foil === 'true' || record.foil === '1' || record.Foil === 'foil') ? 1 : 0;
        condition = record.condicion || record.condition || record.Condition || 'NM';
        scryfallId = null;
      }

      if (!name) {
        failed++;
        continue;
      }

      let cardData = null;

      // If we have Scryfall ID, use it directly (faster)
      if (scryfallId) {
        cardData = await fetchCardByID(scryfallId);
        await new Promise(resolve => setTimeout(resolve, 75)); // Scryfall rate limit
      } else {
        // Otherwise search by name/set
        cardData = await fetchCardData(name, setCode);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (cardData) {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO cards (
              name, set_code, quantity, foil, condition,
              scryfall_id, image_uri, mana_cost, type_line, 
              colors, rarity, price_usd, price_eur
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            name, setCode, quantity, foil, condition,
            cardData.scryfall_id, cardData.image_uri, cardData.mana_cost,
            cardData.type_line, cardData.colors, cardData.rarity,
            cardData.price_usd, cardData.price_eur
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        imported++;
      } else {
        // Insert without Scryfall data
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO cards (name, set_code, quantity, foil, condition)
            VALUES (?, ?, ?, ?, ?)
          `, [name, setCode, quantity, foil, condition], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        imported++;
      }
    }

    fs.unlinkSync(req.file.path); // Clean up uploaded file

    const formatDetected = isManabox ? 'Manabox' : 'Simple';
    res.json({ 
      success: true, 
      imported, 
      failed,
      format: formatDetected,
      message: `Imported ${imported} cards (${formatDetected} format). ${failed} failed.`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete card
app.delete('/api/cards/:id', (req, res) => {
  db.run('DELETE FROM cards WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, deleted: this.changes });
    }
  });
});

// Update card quantity
app.patch('/api/cards/:id', (req, res) => {
  const { quantity } = req.body;
  db.run('UPDATE cards SET quantity = ? WHERE id = ?', [quantity, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, updated: this.changes });
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎴 MTG Collection Manager running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});
