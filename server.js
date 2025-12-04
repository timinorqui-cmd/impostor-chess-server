// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', ({ roomCode }) => {
    rooms.set(roomCode, {
      players: [{ id: socket.id, color: 'white', impostors: null, ready: false }],
      gameState: 'waiting',
      board: null,
      currentTurn: 'white',
      moveCount: 0,
      pawnMoved: { white: false, black: false }
    });
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, color: 'white' });
  });

  socket.on('joinRoom', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    room.players.push({ id: socket.id, color: 'black', impostors: null, ready: false });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, color: 'black' });
    io.to(roomCode).emit('opponentJoined');
    io.to(roomCode).emit('gameStateUpdate', { gameState: 'selectImpostors' });
  });

  socket.on('setImpostors', ({ roomCode, impostors }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.impostors = impostors;
      player.ready = true;
    }

    // Si les deux joueurs sont prêts
    if (room.players.every(p => p.ready)) {
      io.to(roomCode).emit('gameStateUpdate', { gameState: 'playing' });
    } else {
      socket.emit('waitingForOpponent');
    }
  });

  socket.on('makeMove', ({ roomCode, move }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.board = move.board;
    room.currentTurn = move.currentTurn;
    room.moveCount = move.moveCount;
    room.pawnMoved = move.pawnMoved;

    io.to(roomCode).emit('moveMade', {
      board: move.board,
      currentTurn: move.currentTurn,
      moveCount: move.moveCount,
      pawnMoved: move.pawnMoved
    });
  });

  socket.on('activateImpostor', ({ roomCode, position }) => {
    io.to(roomCode).emit('impostorActivated', { position });
  });

  socket.on('gameOver', ({ roomCode, winner }) => {
    io.to(roomCode).emit('gameEnded', { winner });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Nettoyer les rooms
    rooms.forEach((room, code) => {
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        io.to(code).emit('opponentDisconnected');
        rooms.delete(code);
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
