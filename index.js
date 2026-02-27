const { Client, GatewayIntentBits } = require('discord.js');

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Runs once when bot connects
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Simple test command
client.on('messageCreate', message => {
  // Ignore bots
  if (message.author.bot) return;

  // Ping test
  if (message.content === '!ping') {
    message.reply('Pong');
  }
});

// Crash protection (optional but recommended)
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login using Railway environment variable
client.login(process.env.BOT_TOKEN);
