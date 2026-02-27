const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

// ===== ENV =====
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ===== SUPABASE =====
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for Creator access')
    .addStringOption(option =>
      option
        .setName('details')
        .setDescription('Your channel link + short intro')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Test bot')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log('Slash commands registered.');
}

// ===== READY =====
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== MEMBER JOIN =====
client.on('guildMemberAdd', async member => {
  try {
    // Assign Member role
    const memberRole = member.guild.roles.cache.find(r => r.name === 'Member');
    if (memberRole) await member.roles.add(memberRole);

    // Public welcome message
    const welcomeChannel = member.guild.channels.cache.find(
      c => c.name === 'welcome'
    );

    if (welcomeChannel) {
      welcomeChannel.send(
        `Welcome ${member} 👋

If you are a creator, use **/apply** to request Creator access.`
      );
    }

    // DM instructions
    await member.send(
      `Welcome to HyperChat.

To onboard as a creator:

1. Run /apply in the server
2. Submit your channel link
3. Our team will review
4. You will receive Creator role once approved`
    );

    console.log(`Member joined: ${member.user.tag}`);
  } catch (err) {
    console.error('Join handling failed:', err.message);
  }
});

// ===== APPLICATION HANDLING =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    return interaction.reply('Pong');
  }

  if (interaction.commandName === 'apply') {
    const details = interaction.options.getString('details');

    // Save to database
    await supabase.from('creator_applications').insert({
      discord_id: interaction.user.id,
      username: interaction.user.tag,
      content: details
    });

    // Notify staff channel
    const staffChannel = interaction.guild.channels.cache.find(
      c => c.name === 'creator-applications'
    );

    if (staffChannel) {
      staffChannel.send(
        `📩 New Creator Application

User: ${interaction.user.tag}
ID: ${interaction.user.id}

Details:
${details}`
      );
    }

    await interaction.reply({
      content: 'Application submitted. Our team will review it shortly.',
      ephemeral: true
    });
  }
});

// ===== START =====
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
