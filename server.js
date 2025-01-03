const WebSocket = require('ws');
const Database = require('better-sqlite3'); // Import better-sqlite3

// Connect to the SQLite database
const dbPath = process.env.DATABASE_URL || './grid.db'; // Use DATABASE_URL from Railway or fallback to local
const db = new Database(dbPath);

// Initialize the grid table if not exists
db.prepare(`
    CREATE TABLE IF NOT EXISTS grid (
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        color TEXT NOT NULL,
        PRIMARY KEY (x, y)
    )
`).run();

// WebSocket server setup
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const userCooldowns = {};
const activeUsers = new Set(); // Keep track of active users

// Retrieve the grid from the database
function getGrid() {
    const rows = db.prepare('SELECT * FROM grid').all();
    const grid = {};
    rows.forEach(({ x, y, color }) => {
        grid[`${x},${y}`] = color;
    });
    return grid;
}

// Save a pixel to the database
function savePixel(x, y, color) {
    db.prepare(`
        INSERT OR REPLACE INTO grid (x, y, color)
        VALUES (?, ?, ?)
    `).run(x, y, color);
}

const grid = getGrid(); // Initialize the grid from the database

wss.on('connection', (ws) => {
    console.log('Client connected');

    let userId; // Unique user ID

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
                ws.send(JSON.stringify({ type: 'init', grid }));
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
                grid[`${data.x},${data.y}`] = data.color;
                savePixel(data.x, data.y, data.color); // Save the pixel to the database

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
        activeUsers.delete(userId);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started');
