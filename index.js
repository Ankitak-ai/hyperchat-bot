const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// === CONFIG ===
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // Application ID
const GUILD_ID = process.env.GUILD_ID;   // Your test server ID

// === REGISTER COMMANDS ===
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Slash command registered.');
  } catch (error) {
    console.error(error);
  }
})();

// === BOT READY ===
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// === HANDLE SLASH COMMANDS ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong');
  }
});

client.login(TOKEN);
