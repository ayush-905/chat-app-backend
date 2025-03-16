const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const { addUser, removeUser, getUser, getUsersInRoom } = require('./users');

const router = require('./router');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(cors());
app.use(router);

// Add rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Message Schema
// const messageSchema = new mongoose.Schema({
//   room: String,
//   user: String,
//   text: String,
//   timestamp: { type: Date, default: Date.now }
// });

// const Message = mongoose.model('Message', messageSchema);

io.on('connect', (socket) => {
  socket.on('join', ({ name, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, name, room });

    if(error) return callback(error);

    socket.join(user.room);

    socket.emit('message', { user: 'admin', text: `${user.name}, welcome to room ${user.room}.`});
    socket.broadcast.to(user.room).emit('message', { user: 'admin', text: `${user.name} has joined!` });

    io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });

    callback();
  });

  socket.on('sendMessage', async (message, callback) => {
    try {
     
      const sanitizedMessage = sanitizeHtml(message, {
        allowedTags: [],
        allowedAttributes: {}
      });
      const user = getUser(socket.id);
      if (!user) {
        return callback({ error: 'User not found' });
      }
      // const newMessage = new Message({
      //   room: user.room,
      //   user: user.name,
      //   text: sanitizedMessage
      // });
      // await newMessage.save();
      io.to(user.room).emit('message', { user: user.name, text: sanitizedMessage });
      callback();
    } catch (error) {
      callback({ error: 'Message could not be sent' });
    }
  });

  socket.on('disconnect', () => {
    const user = removeUser(socket.id);

    if(user) {
      io.to(user.room).emit('message', { user: 'Admin', text: `${user.name} has left.` });
      io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room)});
    }
  })

  socket.on('private message', ({ to, message }, callback) => {
    try {
      const sender = getUser(socket.id);
      const recipient = getUserByName(to);
      
      if (!recipient) {
        return callback({ error: 'User not found' });
      }

      io.to(recipient.id).emit('private message', {
        from: sender.name,
        message
      });
      
      callback();
    } catch (error) {
      callback({ error: 'Message could not be sent' });
    }
  });

  socket.on('message seen', ({ messageId, room }) => {
    const user = getUser(socket.id);
    io.to(room).emit('message status', {
      messageId,
      seenBy: user.name,
      timestamp: new Date()
    });
  });
});

server.listen(process.env.PORT || 5000, () => console.log(`Server has started.`));