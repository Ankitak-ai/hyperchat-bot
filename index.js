const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
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
    .addStringOption(o =>
      o.setName('details')
        .setDescription('Channel link + intro')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve a creator')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('user')
        .setDescription('User to approve')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject a creator')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('user')
        .setDescription('User to reject')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('reason')
        .setDescription('Reason for rejection')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Test bot')

].map(c => c.toJSON());

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
  const role = member.guild.roles.cache.find(r => r.name === 'Member');
  if (role) await member.roles.add(role);
});

// ===== COMMAND HANDLER =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ===== APPLY =====
  if (interaction.commandName === 'apply') {
    const details = interaction.options.getString('details');

    await supabase.from('creator_applications').insert({
      discord_id: interaction.user.id,
      username: interaction.user.tag,
      content: details
    });

    await interaction.reply({
      content: 'Application submitted.',
      ephemeral: true
    });
  }

  // ===== APPROVE =====
  if (interaction.commandName === 'approve') {

    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id);

    const creatorRole = interaction.guild.roles.cache.find(
      r => r.name === 'Creator'
    );

    if (creatorRole) await member.roles.add(creatorRole);

    // Update DB
    await supabase
      .from('creator_applications')
      .update({
        status: 'approved',
        reviewed_by: interaction.user.id,
        reviewed_at: new Date()
      })
      .eq('discord_id', user.id);

    // DM user
    await user.send(
      `Your HyperChat Creator application has been approved.

You now have Creator access. Follow setup instructions in the server.`
    );

    await interaction.reply(`Approved ${user.tag}`);
  }

  // ===== REJECT =====
  if (interaction.commandName === 'reject') {

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    await supabase
      .from('creator_applications')
      .update({
        status: 'rejected',
        reviewed_by: interaction.user.id,
        reviewed_at: new Date(),
        rejection_reason: reason
      })
      .eq('discord_id', user.id);

    await user.send(
      `Your HyperChat Creator application was not approved.

Reason: ${reason}

You may reapply in the future.`
    );

    await interaction.reply(`Rejected ${user.tag}`);
  }

  // ===== PING =====
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong');
  }
});

// ===== START =====
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
