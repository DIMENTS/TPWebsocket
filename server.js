const fs = require('fs');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const gridFile = './grid.json';
let grid = {};

// Laad de grid bij serverstart
if (fs.existsSync(gridFile)) {
    try {
        grid = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
        console.log('Grid loaded from file.');
    } catch (error) {
        console.error('Error loading grid:', error);
    }
}

// Sla de grid op bij wijzigingen
function saveGrid() {
    fs.writeFileSync(gridFile, JSON.stringify(grid, null, 2));
}

const userCooldowns = {};
const activeUsers = new Set();

wss.on('connection', (ws) => {
    console.log('Client connected');
    let userId;

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
                saveGrid(); // Sla de grid op na elke wijziging

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
