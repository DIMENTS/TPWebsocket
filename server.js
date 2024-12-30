const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 }); // Use environment port or 8080
const grid = {};
const userCooldowns = {};

wss.on('connection', (ws) => {
    console.log('Client connected');

    // Send initial grid data
    ws.send(JSON.stringify({ type: 'init', grid }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'place_pixel') {
                const now = Date.now();
                if (userCooldowns[data.userId] && now - userCooldowns[data.userId] < 30000) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Cooldown active' }));
                }

                userCooldowns[data.userId] = now;
                grid[`${data.x},${data.y}`] = data.color;

                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) { // Prevent sending to self and closed connections
                        client.send(JSON.stringify({ type: 'update_pixel', x: data.x, y: data.y, color: data.color }));
                    }
                });
            }
            if (data.type === 'mouse_move') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'mouse_move', userId: data.userId, x: data.x, y: data.y }));
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
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started');
