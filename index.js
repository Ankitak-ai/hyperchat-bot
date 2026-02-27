const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

// ===== ENV VARIABLES =====
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ===== SUPABASE =====
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!')
].map(cmd => cmd.toJSON());

// ===== REGISTER COMMANDS =====
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Command registration failed:', error);
  }
}

// ===== BOT READY =====
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Test Supabase connection
  try {
    const { error } = await supabase
      .from('test')
      .select('*')
      .limit(1);

    if (error) throw error;

    console.log('Supabase connected.');
  } catch (err) {
    console.error('Supabase connection failed:', err.message);
  }
});

// ===== AUTO REGISTER WHEN BOT JOINS SERVER =====
client.on('guildCreate', async guild => {
  try {
    await supabase
      .from('servers')
      .upsert({
        guild_id: guild.id,
        guild_name: guild.name,
        owner_id: guild.ownerId
      });

    console.log(`Registered new server: ${guild.name}`);
  } catch (err) {
    console.error('Guild registration failed:', err.message);
  }
});

// ===== HANDLE SLASH COMMANDS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const guild = interaction.guild;

  // Ensure server exists in DB (fallback)
  if (guild) {
    await supabase
      .from('servers')
      .upsert({
        guild_id: guild.id,
        guild_name: guild.name,
        owner_id: guild.ownerId
      });
  }

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong');
  }
});

// ===== ERROR HANDLING =====
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// ===== STARTUP =====
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
