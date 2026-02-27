const { Client, GatewayIntentBits } = require('discord.js');

// Create client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Bot ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Simple test command
client.on('messageCreate', message => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply('Pong');
  }
});

// Use environment variable for token (required for Railway)
console.log(process.env.BOT_TOKEN);;
