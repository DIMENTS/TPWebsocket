const WebSocket = require('ws');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// WebSocket Server configuratie
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 }); // Gebruik omgevingspoort of 8080
const grid = {}; // In-memory grid voor snelle toegang
const userCooldowns = {}; // Cooldown-logica per gebruiker

// SQLite Database configuratie
const dbPath = path.join('/data', 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Kan geen verbinding maken met SQLite:', err.message);
    } else {
        console.log('Verbonden met SQLite database op:', dbPath);
    }
});

// Creëer de tabel als deze nog niet bestaat
db.run(`
    CREATE TABLE IF NOT EXISTS pixels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        color TEXT NOT NULL
    )
`, (err) => {
    if (err) {
        console.error('Fout bij het aanmaken van de tabel:', err.message);
    }
});

// WebSocket verbindingen
wss.on('connection', (ws) => {
    console.log('Client verbonden');

    // Haal de bestaande pixels op en stuur naar de client
    db.all(`SELECT x, y, color FROM pixels`, [], (err, rows) => {
        if (err) {
            console.error('Fout bij ophalen van pixels:', err.message);
        } else {
            rows.forEach(row => {
                grid[`${row.x},${row.y}`] = row.color; // Update het in-memory grid
            });
            ws.send(JSON.stringify({ type: 'init', grid })); // Stuur het volledige grid naar de client
        }
    });

    // Verwerk berichten van de client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Pixel plaatsen
            if (data.type === 'place_pixel') {
                const now = Date.now();
                if (userCooldowns[data.userId] && now - userCooldowns[data.userId] < 30000) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Cooldown active' }));
                }

                userCooldowns[data.userId] = now;

                // Sla pixel op in SQLite
                db.run(`
                    INSERT INTO pixels (x, y, color)
                    VALUES (?, ?, ?)
                `, [data.x, data.y, data.color], (err) => {
                    if (err) {
                        console.error('Fout bij opslaan van pixel:', err.message);
                        ws.send(JSON.stringify({ type: 'error', message: 'Fout bij opslaan van pixel' }));
                    } else {
                        console.log('Pixel opgeslagen:', { x: data.x, y: data.y, color: data.color });

                        // Update het in-memory grid
                        grid[`${data.x},${data.y}`] = data.color;

                        // Verstuur de update naar alle verbonden clients
                        wss.clients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'update_pixel', x: data.x, y: data.y, color: data.color }));
                            }
                        });
                    }
                });
            }

            // Muisbeweging doorgeven
            if (data.type === 'mouse_move') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'mouse_move', userId: data.userId, x: data.x, y: data.y }));
                    }
                });
            }
        } catch (error) {
            console.error('Fout bij verwerken van bericht:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Ongeldig berichtformaat' }));
        }
    });

    // Verwerk afsluiten van de verbinding
    ws.on('close', () => {
        console.log('Client verbroken');
    });

    // Foutafhandeling op de verbinding
    ws.on('error', (error) => {
        console.error('WebSocket fout:', error);
    });
});

console.log('WebSocket server gestart op poort', process.env.PORT || 8080);
