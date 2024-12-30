const { WebSocketServer } = require('ws');

// Maak een WebSocket-server
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

wss.on('connection', (socket) => {
  console.log('Nieuwe gebruiker verbonden.');

  socket.on('message', (message) => {
    console.log('Ontvangen bericht:', message);

    // Echo het bericht naar alle clients
    wss.clients.forEach((client) => {
      if (client.readyState === socket.OPEN) {
        client.send(message);
      }
    });
  });

  socket.on('close', () => {
    console.log('Verbinding gesloten.');
  });
});

console.log(`WebSocket-server draait op poort ${process.env.PORT || 8080}`);
