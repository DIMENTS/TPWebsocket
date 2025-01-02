const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const grid = {};
const userCooldowns = {};
const activeUsers = new Set(); // Houd actieve gebruikers bij

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
