require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// WhatsApp Client
let client;
let isClientReady = false;

// Initialize WhatsApp Client
function initializeClient() {
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: process.env.WAPI_SESSION_NAME
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  // Socket connection for real-time updates
  io.on('connection', (socket) => {
    console.log('Web client connected');

    socket.on('disconnect', () => {
      console.log('Web client disconnected');
    });
  });

  // QR Code generation
  client.on('qr', (qr) => {
    console.log('QR Code generated');
    qrcode.generate(qr, { small: true });
    io.emit('qr', qr);
  });

  // Client ready
  client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isClientReady = true;
    io.emit('status', { ready: true, message: 'WhatsApp connected!' });
  });

  // Message handling
  client.on('message', async (message) => {
    const chatId = message.from;
    const messageText = message.body;
    const phoneNumber = chatId.replace('@c.us', '');
    
    // Bot commands
    if (messageText.startsWith(process.env.BOT_PREFIX)) {
      const command = messageText.slice(process.env.BOT_PREFIX.length).trim().split(' ')[0].toLowerCase();
      const args = messageText.slice(process.env.BOT_PREFIX.length).trim().split(' ').slice(1);
      
      await handleCommand(message, command, args, phoneNumber);
    }

    // Send message to web interface
    io.emit('new_message', {
      from: phoneNumber,
      message: messageText,
      timestamp: new Date().toISOString(),
      type: 'incoming'
    });
  });

  // Message acknowledgment
  client.on('message_ack', (msg, ack) => {
    io.emit('message_ack', {
      id: msg.id.id,
      ack: ack
    });
  });

  // Client disconnected
  client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isClientReady = false;
    io.emit('status', { ready: false, message: 'WhatsApp disconnected' });
  });

  // Start client
  client.initialize();
}

// Command handler
async function handleCommand(message, command, args, phoneNumber) {
  const reply = await message.reply(`Command: ${command} executed!`);
  
  switch (command) {
    case 'help':
      const helpText = `Available Commands:
!help - Show this help
!ping - Check bot status
!info - Get contact info
!echo [text] - Echo back your message`;
      await message.reply(helpText);
      break;

    case 'ping':
      await message.reply('Pong! Bot is alive 🚀');
      break;

    case 'info':
      const contact = await message.getContact();
      const infoText = `Contact Info:
Name: ${contact.pushname || 'N/A'}
Number: ${phoneNumber}
Status: ${contact.isBusiness ? 'Business' : 'Personal'}`;
      await message.reply(infoText);
      break;

    case 'echo':
      if (args.length > 0) {
        await message.reply(args.join(' '));
      } else {
        await message.reply('Please provide text to echo!');
      }
      break;

    default:
      await message.reply(`Unknown command: ${command}\nType !help for available commands`);
  }

  // Send command execution to web interface
  io.emit('command_executed', {
    command,
    phoneNumber,
    timestamp: new Date().toISOString()
  });
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    ready: isClientReady,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/send-message', async (req, res) => {
  if (!isClientReady) {
    return res.status(400).json({ error: 'WhatsApp client not ready' });
  }

  const { phoneNumber, message } = req.body;
  
  try {
    const chatId = `${phoneNumber}@c.us`;
    const sentMessage = await client.sendMessage(chatId, message);
    
    io.emit('new_message', {
      from: phoneNumber,
      message,
      timestamp: new Date().toISOString(),
      type: 'outgoing',
      id: sentMessage.id.id
    });

    res.json({ success: true, messageId: sentMessage.id.id });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/api/contacts', async (req, res) => {
  if (!isClientReady) {
    return res.status(400).json({ error: 'WhatsApp client not ready' });
  }

  try {
    const chats = await client.getChats();
    const contacts = chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount
    })).slice(0, 50); // Limit to 50 recent chats

    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
initializeClient();

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WhatsApp Bot initializing...`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (client) {
    client.destroy();
  }
  server.close(() => {
    console.log('Process terminated');
  });
});
