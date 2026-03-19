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

// SSE clients for upload progress
let uploadClients = [];

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
      binder_name TEXT,
      binder_type TEXT,
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

// Get all cards (with pagination)
app.get('/api/cards', (req, res) => {
  const { search, color, type, rarity, set, binder, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let query = 'SELECT * FROM cards WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as total FROM cards WHERE 1=1';
  const params = [];
  const countParams = [];

  if (search) {
    query += ' AND name LIKE ?';
    countQuery += ' AND name LIKE ?';
    params.push(`%${search}%`);
    countParams.push(`%${search}%`);
  }
  if (color) {
    query += ' AND colors LIKE ?';
    countQuery += ' AND colors LIKE ?';
    params.push(`%${color}%`);
    countParams.push(`%${color}%`);
  }
  if (type) {
    query += ' AND type_line LIKE ?';
    countQuery += ' AND type_line LIKE ?';
    params.push(`%${type}%`);
    countParams.push(`%${type}%`);
  }
  if (rarity) {
    query += ' AND rarity = ?';
    countQuery += ' AND rarity = ?';
    params.push(rarity);
    countParams.push(rarity);
  }
  if (set) {
    query += ' AND set_code = ?';
    countQuery += ' AND set_code = ?';
    params.push(set.toUpperCase());
    countParams.push(set.toUpperCase());
  }
  if (binder) {
    query += ' AND binder_name LIKE ?';
    countQuery += ' AND binder_name LIKE ?';
    params.push(`%${binder}%`);
    countParams.push(`%${binder}%`);
  }

  query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  // Get total count
  db.get(countQuery, countParams, (err, countRow) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // Get paginated results
    db.all(query, params, (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          cards: rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: countRow.total,
            totalPages: Math.ceil(countRow.total / parseInt(limit))
          }
        });
      }
    });
  });
});

// Get unique sets
app.get('/api/sets', (req, res) => {
  db.all('SELECT DISTINCT set_code FROM cards WHERE set_code IS NOT NULL ORDER BY set_code', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows.map(r => r.set_code));
    }
  });
});

// Get unique binders
app.get('/api/binders', (req, res) => {
  db.all('SELECT DISTINCT binder_name FROM cards WHERE binder_name IS NOT NULL ORDER BY binder_name', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows.map(r => r.binder_name));
    }
  });
});

// SSE endpoint for upload progress
app.get('/api/upload-progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  uploadClients.push(newClient);

  req.on('close', () => {
    uploadClients = uploadClients.filter(client => client.id !== clientId);
  });
});

function sendProgressUpdate(data) {
  uploadClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

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
    const totalRecords = records.length;

    // Detect format (Manabox vs simple)
    const isManabox = records.length > 0 && records[0]['Scryfall ID'];

    // Send initial progress
    sendProgressUpdate({ current: 0, total: totalRecords, status: 'starting' });

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      let name, setCode, quantity, foil, condition, scryfallId, binderName, binderType;

      if (isManabox) {
        name = record['Name'];
        setCode = record['Set code'];
        quantity = parseInt(record['Quantity'] || 1);
        foil = (record['Foil'] === 'foil' || record['Foil'] === 'true') ? 1 : 0;
        condition = record['Condition'] || 'NM';
        scryfallId = record['Scryfall ID'];
        binderName = record['Binder Name'];
        binderType = record['Binder Type'];
      } else {
        name = record.nombre || record.name || record.Name;
        setCode = record.set || record.set_code || record['Set code'] || null;
        quantity = parseInt(record.cantidad || record.quantity || record.Quantity || 1);
        foil = (record.foil === 'true' || record.foil === '1' || record.Foil === 'foil') ? 1 : 0;
        condition = record.condicion || record.condition || record.Condition || 'NM';
        scryfallId = null;
        binderName = record.binder || record.binder_name || null;
        binderType = null;
      }

      if (!name) {
        failed++;
        sendProgressUpdate({ 
          current: i + 1, 
          total: totalRecords, 
          status: 'processing',
          cardName: 'Invalid entry',
          failed 
        });
        continue;
      }

      let cardData = null;

      if (scryfallId) {
        cardData = await fetchCardByID(scryfallId);
        await new Promise(resolve => setTimeout(resolve, 75));
      } else {
        cardData = await fetchCardData(name, setCode);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (cardData) {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO cards (
              name, set_code, quantity, foil, condition, binder_name, binder_type,
              scryfall_id, image_uri, mana_cost, type_line, 
              colors, rarity, price_usd, price_eur
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            name, setCode, quantity, foil, condition, binderName, binderType,
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
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO cards (name, set_code, quantity, foil, condition, binder_name, binder_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [name, setCode, quantity, foil, condition, binderName, binderType], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        imported++;
      }

      // Send progress update
      sendProgressUpdate({ 
        current: i + 1, 
        total: totalRecords, 
        status: 'processing',
        cardName: name,
        imported,
        failed
      });
    }

    fs.unlinkSync(req.file.path);

    sendProgressUpdate({ 
      current: totalRecords, 
      total: totalRecords, 
      status: 'complete',
      imported,
      failed
    });

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
    sendProgressUpdate({ status: 'error', message: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Check deck (what's missing)
app.post('/api/check-deck', async (req, res) => {
  const { decklist } = req.body;
  
  if (!decklist) {
    return res.status(400).json({ error: 'No decklist provided' });
  }

  try {
    const lines = decklist.split('\n').filter(l => l.trim());
    const deckCards = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
      
      const match = trimmed.match(/^(\d+)\s+(.+)$/) || trimmed.match(/^(.+)$/);
      if (match) {
        const quantity = match[1] && !isNaN(match[1]) ? parseInt(match[1]) : 1;
        const cardName = match[2] || match[1];
        deckCards.push({ name: cardName.trim(), needed: quantity });
      }
    }

    const results = [];
    
    for (const deckCard of deckCards) {
      const owned = await new Promise((resolve, reject) => {
        db.get(
          'SELECT SUM(quantity) as total FROM cards WHERE name LIKE ?',
          [`%${deckCard.name}%`],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.total || 0);
          }
        );
      });

      results.push({
        name: deckCard.name,
        needed: deckCard.needed,
        owned: owned,
        missing: Math.max(0, deckCard.needed - owned),
        status: owned >= deckCard.needed ? 'complete' : 'missing'
      });
    }

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all cards
app.delete('/api/cards/all', (req, res) => {
  db.run('DELETE FROM cards', function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, deleted: this.changes });
    }
  });
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
