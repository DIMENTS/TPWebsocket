const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();

// Maak verbinding met de SQLite-database
const db = new sqlite3.Database(process.env.DATABASE_URL || 'grid.db', (err) => {
    if (err) {
        console.error('Error connecting to SQLite:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Tabel aanmaken als die nog niet bestaat
db.run(`
  CREATE TABLE IF NOT EXISTS grid (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    color TEXT NOT NULL,
    PRIMARY KEY (x, y)
  )
`);

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const userCooldowns = {};
const activeUsers = new Set(); // Houd actieve gebruikers bij

// Functie om een pixel op te slaan in de database
function savePixel(x, y, color) {
    const query = `INSERT OR REPLACE INTO grid (x, y, color) VALUES (?, ?, ?)`;
    db.run(query, [x, y, color], (err) => {
        if (err) {
            console.error('Error saving pixel:', err.message);
        }
    });
}

// Functie om het grid op te halen uit de database
function loadGrid(callback) {
    const query = `SELECT * FROM grid`;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error loading grid:', err.message);
        } else {
            const gridData = {};
            rows.forEach((row) => {
                gridData[`${row.x},${row.y}`] = row.color;
            });
            callback(gridData);
        }
    });
}

// WebSocket-logica
wss.on('connection', (ws) => {
    console.log('Client connected');
    let userId; // Unieke gebruiker-ID

    // Verwerk berichten van de client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'init') {
                userId = data.userId;
                if (activeUsers.has(userId)) {
                    ws.send(JSON.stringify({ type: 'error', message: 'User ID already in use' }));
                    return ws.close();
                }
                activeUsers.add(userId);

                // Stuur het grid naar de gebruiker bij initialisatie
                loadGrid((gridData) => {
                    ws.send(JSON.stringify({ type: 'init', grid: gridData }));
                });
            }

            if (data.type === 'place_pixel') {
                if (!userId || !activeUsers.has(userId)) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Invalid user ID' }));
                }

                const now = Date.now();
                if (userCooldowns[userId] && now - userCooldowns[userId] < 30000) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Cooldown active' }));
                }

                userCooldowns[userId] = now;
                savePixel(data.x, data.y, data.color); // Sla de pixel op in de database

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'update_pixel', x: data.x, y: data.y, color: data.color }));
                    }
                });
            }

            if (data.type === 'mouse_move') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'mouse_move', userId, x: data.x, y: data.y }));
                    }
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        activeUsers.delete(userId); // Verwijder de gebruiker bij disconnect
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started');
