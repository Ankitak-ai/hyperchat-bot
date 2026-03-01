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

const missingEnv = requiredEnv.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error("Missing env:", missingEnv.join(', '));
  process.exit(1);
}

const config = {
  token: process.env.BOT_TOKEN,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  guildId: process.env.GUILD_ID,
  applicationChannelId: process.env.APPLICATION_CHANNEL_ID,
  supportCategoryId: process.env.SUPPORT_CATEGORY_ID,
  creatorRoleId: process.env.CREATOR_ROLE_ID,
  creatorPendingRoleId: process.env.CREATOR_PENDING_ROLE_ID,
  reviewerIds: (process.env.REVIEWER_IDS || '532448115861749770')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean),
  alertRoleIds: (process.env.ALERT_ROLE_IDS || '532448115861749770')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);


// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});


// ============================================================
// HELPERS
// ============================================================

function ensureReviewer(userId) {
  return config.reviewerIds.includes(userId);
}

function safeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70);
}

function sanitizeText(input) {
  return input.replace(/@everyone|@here/g, '[blocked]');
}

async function safeDM(user, msg) {
  try { await user.send(msg); } catch {}
}


// ============================================================
// COMMANDS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply as creator')
    .addStringOption(o =>
      o.setName('details')
        .setRequired(true)
        .setDescription('About you')
    ),

  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Open support ticket')
].map(c => c.toJSON());


// ============================================================
// APPLICATION FLOW
// ============================================================

async function getActiveApplication(userId) {
  const { data } = await supabase
    .from('creator_applications')
    .select('*')
    .eq('discord_id', userId)
    .in('status', ['pending','approved_pending','approved'])
    .limit(1);

  return data?.[0] || null;
}

async function createApplication(interaction) {
  const details = sanitizeText(
    interaction.options.getString('details')
  );

  const existing = await getActiveApplication(interaction.user.id);

  if (existing) {
    return interaction.editReply({
      content: `Active application exists: ${existing.status}`
    });
  }

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

  const channel = await interaction.guild.channels.fetch(
    config.applicationChannelId
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${data.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`reject_${data.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content:
      `${config.alertRoleIds.map(id => `<@&${id}>`).join(' ')}\n` +
      `New application from <@${interaction.user.id}>\n${details}`,
    components: [row],
    allowedMentions: { roles: config.alertRoleIds }
  });

  await interaction.editReply({
    content: "Application submitted."
  });
}


// ============================================================
// APPROVE / REJECT
// ============================================================

async function approveApplication(interaction, id) {

  if (!ensureReviewer(interaction.user.id))
    return interaction.editReply({ content: "Not authorized." });

  const { data } = await supabase
    .from('creator_applications')
    .update({ status: 'approved_pending' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (!data)
    return interaction.editReply({ content: "Already processed." });

  const member = await interaction.guild.members.fetch(
    data.discord_id
  );

  const role = await interaction.guild.roles.fetch(
    config.creatorPendingRoleId
  );

  await member.roles.add(role);

  await safeDM(member.user,
    "Your creator application was approved for onboarding."
  );

  await interaction.editReply({
    content: "Approved.",
    components: []
  });
}


async function rejectApplication(interaction, id) {

  if (!ensureReviewer(interaction.user.id))
    return interaction.editReply({ content: "Not authorized." });

  const { data } = await supabase
    .from('creator_applications')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (!data)
    return interaction.editReply({ content: "Already processed." });

  const user = await client.users.fetch(data.discord_id);

  await safeDM(user,
    "Your creator application was not approved."
  );

  await interaction.editReply({
    content: "Rejected.",
    components: []
  });
}


// ============================================================
// SUPPORT TICKET
// ============================================================

async function createTicket(interaction) {

  const guild = interaction.guild;

  const existing = guild.channels.cache.find(c =>
    c.topic === `ticket:${interaction.user.id}`
  );

  if (existing)
    return interaction.editReply({
      content: `Existing ticket: ${existing}`
    });

  const category = await guild.channels.fetch(
    config.supportCategoryId
  );

  const channel = await guild.channels.create({
    name: `ticket-${safeName(interaction.user.username)}-${interaction.user.discriminator}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ]
      },
      ...config.alertRoleIds.map(id => ({
        id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ]
      }))
    ]
  });

  await channel.send(
    `<@${interaction.user.id}> Support will assist shortly.`
  );

  await interaction.editReply({
    content: `Ticket created: ${channel}`
  });
}


// ============================================================
// EVENTS
// ============================================================

client.once('ready', async () => {

  console.log(`Logged in as ${client.user.tag}`);

  await client.application.commands.set(
    commands,
    config.guildId
  );

});


client.on('interactionCreate', async interaction => {

  if (!interaction.inGuild()) return;

  try {

    if (interaction.isChatInputCommand()) {

      await interaction.deferReply({ ephemeral: true });

      if (interaction.commandName === 'apply')
        return createApplication(interaction);

      if (interaction.commandName === 'support')
        return createTicket(interaction);
    }

    if (interaction.isButton()) {

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId.startsWith('approve_'))
        return approveApplication(
          interaction,
          interaction.customId.split('_')[1]
        );

      if (interaction.customId.startsWith('reject_'))
        return rejectApplication(
          interaction,
          interaction.customId.split('_')[1]
        );
    }

  } catch (err) {

    console.error(err);

    if (interaction.deferred)
      await interaction.editReply({
        content: "Error occurred."
      });

  }

});


client.login(config.token);
