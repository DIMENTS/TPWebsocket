const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const grid = {};
const userCooldowns = {};
const connectedUsers = new Set();
const userRequests = {}; // Nieuw object voor rate limiting
const MAX_REQUESTS_PER_MINUTE = 5; // Bijvoorbeeld 5 verzoeken per minuut

wss.on('connection', (ws) => {
    connectedUsers.add(ws);
    console.log('Client connected');

    ws.send(JSON.stringify({ type: 'init', grid }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'mouse_move') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data)); // Stuur het bericht door naar alle andere clients
                    }
                });
            }

            if (data.type === 'place_pixel') {
                const now = Date.now();
                const userId = data.userId;

                // Cooldown check (houd je huidige cooldown functionaliteit)
                if (userCooldowns[userId] && now - userCooldowns[userId] < 30000) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Cooldown active' }));
                }

                // Rate limiting check
                if (!userRequests[userId]) {
                    userRequests[userId] = { count: 0, lastRequestTime: 0 };
                }

                if (now - userRequests[userId].lastRequestTime < 60000) { // Binnen 1 minuut
                    if (userRequests[userId].count >= MAX_REQUESTS_PER_MINUTE) {
                        return ws.send(JSON.stringify({ type: 'error', message: 'Te veel verzoeken. Probeer het later opnieuw.' }));
                    }
                    userRequests[userId].count++;
                } else {
                    userRequests[userId].count = 1; // Reset count als er langer dan 1 minuut geen verzoek is geweest
                }
                userRequests[userId].lastRequestTime = now;

                userCooldowns[userId] = now; // Zet de cooldown na de rate limit check

                grid[`${data.x},${data.y}`] = data.color;

                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'update_pixel', x: data.x, y: data.y, color: data.color }));
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
        connectedUsers.delete(ws);
        // Stuur een bericht naar alle andere clients dat deze gebruiker is disconnected
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'user_disconnected', userId: ws.userId }));
            }
        });
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedUsers.delete(ws);
    });
});

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started');
