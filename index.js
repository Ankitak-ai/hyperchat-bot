const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');


// ============================================================
// ENV VALIDATION
// ============================================================

const requiredEnv = [
  'BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'GUILD_ID',
  'APPLICATION_CHANNEL_ID',
  'SUPPORT_CATEGORY_ID',
  'CREATOR_ROLE_ID',
  'CREATOR_PENDING_ROLE_ID'
];

const missing = requiredEnv.filter(k => !process.env[k]);

if (missing.length) {
  console.error('Missing env:', missing.join(', '));
  process.exit(1);
}


// ============================================================
// CONFIG
// ============================================================

const config = {
  token: process.env.BOT_TOKEN,
  guildId: process.env.GUILD_ID,
  applicationChannelId: process.env.APPLICATION_CHANNEL_ID,
  supportCategoryId: process.env.SUPPORT_CATEGORY_ID,
  creatorRoleId: process.env.CREATOR_ROLE_ID,
  creatorPendingRoleId: process.env.CREATOR_PENDING_ROLE_ID,
  alertRoleIds: (process.env.ALERT_ROLE_IDS || '1476924303277822042').split(',').filter(Boolean),
  reviewerIds: (process.env.REVIEWER_IDS || '532448115861749770').split(',').filter(Boolean)
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);


// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});


// ============================================================
// CONSTANTS
// ============================================================

const customIds = {
  apply: 'apply_btn',
  support: 'support_btn',
  approve: 'approve_',
  reject: 'reject_',
  close: 'close_'
};


// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply as HyperChat creator')
    .addStringOption(o =>
      o.setName('details')
        .setDescription('Your content + goals')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('activate')
    .setDescription('Activate approved creator')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Creator')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Open support ticket')
].map(c => c.toJSON());


// ============================================================
// HELPERS
// ============================================================

function sanitize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 80);
}

async function safeDM(user, msg) {
  try { await user.send(msg); } catch {}
}


// ============================================================
// APPLICATION FLOW
// ============================================================

async function handleApply(interaction) {

  const details = interaction.options.getString('details', true);

  const { data, error } = await supabase
    .from('creator_applications')
    .insert({
      discord_id: interaction.user.id,
      username: interaction.user.tag,
      details,
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;

  const guild = interaction.guild;
  const channel = await guild.channels.fetch(config.applicationChannelId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customIds.approve + data.id)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(customIds.reject + data.id)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

  const mention = config.alertRoleIds.map(id => `<@&${id}>`).join(' ');

  await channel.send({
    content:
      `${mention}\nNew application from <@${interaction.user.id}>\n\n${details}`,
    components: [row]
  });

  await interaction.editReply({
    content: 'Application submitted.'
  });
}


// ============================================================
// APPROVAL BUTTON
// ============================================================

async function approveApplication(interaction, id) {

  const { data } = await supabase
    .from('creator_applications')
    .select('*')
    .eq('id', id)
    .single();

  if (!data) {
    await interaction.editReply({ content: 'Application not found.' });
    return;
  }

  const member = await interaction.guild.members.fetch(data.discord_id);

  await member.roles.add(config.creatorPendingRoleId);

  await supabase
    .from('creator_applications')
    .update({ status: 'approved_pending' })
    .eq('id', id);

  await safeDM(member.user,
    'Your application was approved. Complete onboarding.');

  await interaction.editReply({
    content: `Approved <@${member.id}>`,
    components: []
  });
}


// ============================================================
// REJECT BUTTON
// ============================================================

async function rejectApplication(interaction, id) {

  await supabase
    .from('creator_applications')
    .update({ status: 'rejected' })
    .eq('id', id);

  await interaction.editReply({
    content: 'Application rejected.',
    components: []
  });
}


// ============================================================
// ACTIVATE COMMAND
// ============================================================

async function activateCreator(interaction) {

  const user = interaction.options.getUser('user', true);
  const member = await interaction.guild.members.fetch(user.id);

  await member.roles.remove(config.creatorPendingRoleId);
  await member.roles.add(config.creatorRoleId);

  await supabase
    .from('creator_applications')
    .update({ status: 'approved' })
    .eq('discord_id', user.id);

  await safeDM(user, 'You are now an active creator.');

  await interaction.editReply({
    content: `Activated ${user.tag}`
  });
}


// ============================================================
// SUPPORT TICKET
// ============================================================

async function createTicket(interaction) {

  const guild = interaction.guild;
  const category = await guild.channels.fetch(config.supportCategoryId);

  const existing = guild.channels.cache.find(
    c => c.topic === `ticket:${interaction.user.id}`
  );

  if (existing) {
    await interaction.editReply({
      content: `Ticket already exists: ${existing}`
    });
    return;
  }

  const channel = await guild.channels.create({
    name: `ticket-${sanitize(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] }
    ]
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customIds.close + interaction.user.id)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `Support ticket for <@${interaction.user.id}>`,
    components: [row]
  });

  await interaction.editReply({
    content: `Ticket created: ${channel}`
  });
}


// ============================================================
// EVENT HANDLERS
// ============================================================

client.once('ready', async () => {

  console.log(`Logged in as ${client.user.tag}`);

  await client.application.commands.set(commands, config.guildId);
});


client.on('interactionCreate', async interaction => {

  if (!interaction.inGuild()) return;

  try {

    if (interaction.isChatInputCommand()) {

      await interaction.deferReply({ ephemeral: true });

      if (interaction.commandName === 'apply')
        return handleApply(interaction);

      if (interaction.commandName === 'activate')
        return activateCreator(interaction);

      if (interaction.commandName === 'support')
        return createTicket(interaction);
    }


    if (interaction.isButton()) {

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId.startsWith(customIds.approve))
        return approveApplication(
          interaction,
          interaction.customId.replace(customIds.approve, '')
        );

      if (interaction.customId.startsWith(customIds.reject))
        return rejectApplication(
          interaction,
          interaction.customId.replace(customIds.reject, '')
        );

      if (interaction.customId.startsWith(customIds.close)) {

        await interaction.channel.delete();
        return;
      }
    }

  } catch (err) {

    console.error(err);

    if (interaction.deferred)
      await interaction.editReply({ content: 'Error occurred.' });
  }
});


// ============================================================
// START BOT
// ============================================================

client.login(config.token);
