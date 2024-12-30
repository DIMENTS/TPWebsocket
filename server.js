const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8083 });

const grid = {}; // Opslaan van grid-staat { 'x,y': '#FFFFFF' }
const userCooldowns = {}; // Bijhouden van cooldown per gebruiker
const activeUsers = {}; // Bijhouden van muisbewegingen per gebruiker

wss.on('connection', (socket) => {
  console.log('Nieuwe gebruiker verbonden.');

  // Stuur huidige grid en actieve gebruikers naar nieuwe gebruiker
  socket.send(JSON.stringify({ type: 'init', grid, activeUsers }));

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Pixel plaatsen
      if (data.type === 'place_pixel') {
        const now = Date.now();

        // Controleer cooldown
        if (userCooldowns[data.userId] && now - userCooldowns[data.userId] < 30000) {
          socket.send(JSON.stringify({ type: 'error', message: 'Cooldown actief. Wacht 30 seconden.' }));
          return;
        }

        // Update cooldown en grid
        userCooldowns[data.userId] = now;
        const { x, y, color } = data;
        grid[`${x},${y}`] = color;

        // Stuur update naar alle clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'update_pixel', x, y, color }));
          }
        });
      }

      // Muisbeweging bijwerken
      if (data.type === 'move_mouse') {
        const { userId, x, y } = data;
        activeUsers[userId] = { x, y };

        // Stuur muisbewegingen naar alle clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'mouse_move',
              userId,
              x,
              y
            }));
          }
        });
      }
    } catch (err) {
      console.error('Fout bij verwerken bericht:', err);
    }
  });

  socket.on('close', () => {
    console.log('Verbinding gesloten.');

    // Verwijder de gebruiker uit actieve gebruikers
    for (const [userId, user] of Object.entries(activeUsers)) {
      if (user.socket === socket) {
        delete activeUsers[userId];
        break;
      }
    }

    // Optioneel: Stuur een update naar alle clients dat de gebruiker is vertrokken
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'user_disconnected', userId }));
      }
    });
  });
});

console.log('WebSocket-server draait');
