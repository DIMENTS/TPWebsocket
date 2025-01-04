const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const grid = {};
const userCooldowns = {}; // Stores timestamps for cooldowns
const connectedUsers = new Set(); // Set for better performance with many users
const userRequests = {};
const MAX_REQUESTS_PER_MINUTE = 5;

wss.on('connection', (ws) => {
  connectedUsers.add(ws);
  console.log('Client connected');

  // Send initial grid data to the new client
  ws.send(JSON.stringify({ type: 'init', grid }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {

          case 'update_pixel':
  grid[`${data.x},${data.y}`] = data.color;
  wss.clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'update_pixel', x: data.x, y: data.y, color: data.color }));
    }
  });
  break;

        case 'mouse_move':
          // Broadcast mouse movement to all connected clients (excluding sender)
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
          break;

        case 'place_pixel':
          const now = Date.now();

          if (userCooldowns[ws] && now < userCooldowns[ws]) {
              const remainingCooldown = Math.ceil((userCooldowns[ws] - now) / 1000);
              return ws.send(JSON.stringify({ type: 'cooldown', remaining: remainingCooldown }));
          }

          if (!userRequests[ws]) {
              userRequests[ws] = { count: 0, lastRequestTime: 0 };
          }

          if (now - userRequests[ws].lastRequestTime < 60000) {
              if (userRequests[ws].count >= MAX_REQUESTS_PER_MINUTE) {
                  return ws.send(JSON.stringify({ type: 'error', message: 'Te veel verzoeken. Probeer het later opnieuw.' }));
              }
              userRequests[ws].count++;
          } else {
              userRequests[ws].count = 1;
          }
          userRequests[ws].lastRequestTime = now;

          grid[`${data.x},${data.y}`] = data.color;
          wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'update_pixel', x: data.x, y: data.y, color: data.color }));
               }
          });
          break;


        default:
          console.warn(`Unknown message type: ${data.type}`);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    connectedUsers.delete(ws);
    console.log('Client disconnected');

    // Broadcast user disconnect notification to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'user_disconnected', userId: ws.userId })); // Assuming 'userId' is defined elsewhere
      }
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    connectedUsers.delete(ws);
  });
});

console.log('WebSocket server started');
