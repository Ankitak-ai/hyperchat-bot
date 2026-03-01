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
// Environment configuration and startup validation
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

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
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
  alertRoleIds: (process.env.ALERT_ROLE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  reviewerIds: (process.env.REVIEWER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ]
});

const appNotifyCache = new Set();
const welcomeCache = new Set();

const customIds = {
  apply: 'onboarding_apply',
  support: 'onboarding_support',
  learn: 'onboarding_learn',
  approvePrefix: 'application_approve_',
  rejectPrefix: 'application_reject_',
  closeTicketPrefix: 'ticket_close_'
};

// ============================================================
// Slash command definitions
// ============================================================
const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply as a creator for HyperChat')
    .addStringOption((option) =>
      option
        .setName('details')
        .setDescription('Tell us about your content, audience, and goals')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('activate')
    .setDescription('Activate an approved creator after onboarding completion')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
    .addUserOption((option) =>
      option.setName('user').setDescription('Creator to activate').setRequired(true)
    ),
  new SlashCommandBuilder().setName('support').setDescription('Open a private support ticket')
].map((command) => command.toJSON());

// ============================================================
// Utility helpers
// ============================================================
function sanitizeChannelName(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function extractIdFromCustomId(customId, prefix) {
  if (!customId.startsWith(prefix)) return null;
  return customId.slice(prefix.length);
}

async function safeDm(user, content) {
  try {
    await user.send(content);
    return true;
  } catch (error) {
    console.warn(`Failed DM to ${user.id}: ${error.message}`);
    return false;
  }
}

async function logToConsole(message, error = null) {
  if (error) {
    console.error(message, error);
  } else {
    console.log(message);
  }
}

async function registerCommands() {
  await client.application.commands.set(commands, config.guildId);
  console.log(`Registered ${commands.length} slash commands for guild ${config.guildId}`);
}

async function fetchApplicationByDiscordId(discordId) {
  const { data, error } = await supabase
    .from('creator_applications')
    .select('*')
    .eq('discord_id', discordId)
    .in('status', ['pending', 'approved_pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data[0] || null;
}

function buildApplicationActionRow(applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIds.approvePrefix}${applicationId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${customIds.rejectPrefix}${applicationId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildWelcomeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customIds.apply).setLabel('Apply as Creator').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customIds.support).setLabel('Get Support').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customIds.learn).setLabel('Learn More').setStyle(ButtonStyle.Secondary)
  );
}

async function notifyReviewers(application) {
  if (appNotifyCache.has(application.id)) return;
  appNotifyCache.add(application.id);

  const reviewerMessage = [
    `New creator application submitted by **${application.username}** (${application.discord_id}).`,
    `Application ID: ${application.id}`
  ].join('\n');

  for (const reviewerId of config.reviewerIds) {
    try {
      const reviewer = await client.users.fetch(reviewerId);
      await reviewer.send(reviewerMessage);
    } catch (error) {
      console.warn(`Unable to DM reviewer ${reviewerId}: ${error.message}`);
    }
  }
}

async function sendApplicationToReviewChannel(guild, applicant, details, application) {
  const channel = await guild.channels.fetch(config.applicationChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('APPLICATION_CHANNEL_ID is not a valid text channel in this guild.');
  }

  const mentionRoles = config.alertRoleIds.map((id) => `<@&${id}>`).join(' ');
  const contentLines = [
    mentionRoles,
    '**New Creator Application**',
    `Applicant: <@${applicant.id}> (${applicant.tag})`,
    `Discord ID: ${applicant.id}`,
    '',
    '**Details**',
    details
  ].filter(Boolean);

  await channel.send({
    content: contentLines.join('\n'),
    components: [buildApplicationActionRow(application.id)],
    allowedMentions: { roles: config.alertRoleIds }
  });
}

async function createSupportTicket(interaction, user) {
  const guild = interaction.guild;
  const member = await guild.members.fetch(user.id);
  const category = await guild.channels.fetch(config.supportCategoryId).catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('SUPPORT_CATEGORY_ID is not a valid category channel in this guild.');
  }

  const baseName = sanitizeChannelName(user.username || `user-${user.id}`);
  const channelName = `ticket-${baseName}`.slice(0, 95);

  const existing = guild.channels.cache.find(
    (channel) =>
      channel.parentId === category.id &&
      channel.type === ChannelType.GuildText &&
      channel.topic === `ticket_owner:${user.id}`
  );

  if (existing) {
    return { channel: existing, created: false };
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket_owner:${user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks
        ]
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages
        ]
      },
      ...config.alertRoleIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }))
    ]
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIds.closeTicketPrefix}${user.id}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `Hello <@${member.id}>. A support team member will help you shortly.`,
    components: [closeRow]
  });

  return { channel: ticketChannel, created: true };
}

async function handleApply(interaction) {
  const details = interaction.options.getString('details', true).trim();

  if (details.length < 15) {
    await interaction.editReply({
      content: 'Please provide more detail (at least 15 characters) so reviewers can evaluate your application.'
    });
    return;
  }

  const existing = await fetchApplicationByDiscordId(interaction.user.id);
  if (existing && existing.status !== 'rejected') {
    await interaction.editReply({
      content: `You already have an active application with status: **${existing.status}**.`
    });
    return;
  }

  const { data: application, error } = await supabase
    .from('creator_applications')
    .insert({
      discord_id: interaction.user.id,
      username: interaction.user.tag,
      details,
      status: 'pending'
    })
    .select('*')
    .single();

  if (error) throw error;

  await sendApplicationToReviewChannel(interaction.guild, interaction.user, details, application);
  await notifyReviewers(application);

  await interaction.editReply({
    content: 'Your creator application has been submitted. Our team will review it shortly.'
  });
}

async function handleApproveButton(interaction, applicationId) {
  const { data: application, error: appError } = await supabase
    .from('creator_applications')
    .select('*')
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    await interaction.editReply({ content: 'Application not found.' });
    return;
  }

  if (application.status !== 'pending') {
    await interaction.editReply({ content: `This application is already processed with status: ${application.status}.` });
    return;
  }

  const member = await interaction.guild.members.fetch(application.discord_id).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: 'Could not find this applicant in the guild.' });
    return;
  }

  const pendingRole = await interaction.guild.roles.fetch(config.creatorPendingRoleId).catch(() => null);
  if (!pendingRole) {
    await interaction.editReply({ content: 'CREATOR_PENDING_ROLE_ID is invalid or inaccessible.' });
    return;
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from('creator_applications')
    .update({ status: 'approved_pending' })
    .eq('id', application.id)
    .eq('status', 'pending')
    .select('*');

  if (updateError) throw updateError;
  if (!updatedRows || updatedRows.length === 0) {
    await interaction.editReply({ content: 'Application status changed by another reviewer. No action taken.' });
    return;
  }

  await member.roles.add(pendingRole).catch((err) => logToConsole('Failed assigning pending role', err));
  await safeDm(
    member.user,
    'Your HyperChat creator application was approved for onboarding. You now have Creator-Pending access. Please complete onboarding steps; a team member will guide you to full activation.'
  );

  await interaction.editReply({
    content: `✅ Approved by ${interaction.user.tag}. Status moved to approved_pending and Creator-Pending role assigned.`,
    components: []
  });

  console.log(`Application ${application.id} approved by ${interaction.user.id}`);
}

async function handleRejectButton(interaction, applicationId) {
  const { data: application, error: appError } = await supabase
    .from('creator_applications')
    .select('*')
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    await interaction.editReply({ content: 'Application not found.' });
    return;
  }

  if (application.status !== 'pending') {
    await interaction.editReply({ content: `This application is already processed with status: ${application.status}.` });
    return;
  }

  const { error } = await supabase
    .from('creator_applications')
    .update({ status: 'rejected' })
    .eq('id', application.id)
    .eq('status', 'pending');

  if (error) throw error;

  const user = await client.users.fetch(application.discord_id).catch(() => null);
  if (user) {
    await safeDm(user, 'Your HyperChat creator application was reviewed and not approved at this time.');
  }

  await interaction.editReply({
    content: `❌ Rejected by ${interaction.user.tag}.`,
    components: []
  });

  console.log(`Application ${application.id} rejected by ${interaction.user.id}`);
}

async function handleActivateCommand(interaction) {
  const user = interaction.options.getUser('user', true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await interaction.editReply({ content: 'That user is not in this guild.' });
    return;
  }

  const pendingRole = await interaction.guild.roles.fetch(config.creatorPendingRoleId).catch(() => null);
  const creatorRole = await interaction.guild.roles.fetch(config.creatorRoleId).catch(() => null);

  if (!pendingRole || !creatorRole) {
    await interaction.editReply({ content: 'Creator role configuration is invalid. Check CREATOR_ROLE_ID and CREATOR_PENDING_ROLE_ID.' });
    return;
  }

  const { data: updatedRows, error } = await supabase
    .from('creator_applications')
    .update({ status: 'approved' })
    .eq('discord_id', user.id)
    .eq('status', 'approved_pending')
    .select('*');

  if (error) throw error;

  if (!updatedRows || updatedRows.length === 0) {
    await interaction.editReply({
      content: 'No approved_pending application found for this user. Activation aborted.'
    });
    return;
  }

  await member.roles.remove(pendingRole).catch((err) => logToConsole('Failed removing pending role', err));
  await member.roles.add(creatorRole).catch((err) => logToConsole('Failed assigning creator role', err));

  await safeDm(
    user,
    'You are now fully activated as a HyperChat creator. Your Creator role is live. Welcome aboard!'
  );

  await interaction.editReply({
    content: `✅ Activated ${user.tag}. Creator-Pending removed, Creator role assigned, and database status updated to approved.`
  });

  console.log(`Creator ${user.id} activated by ${interaction.user.id}`);
}

async function handleTicketClose(interaction, ownerId) {
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ content: 'This button can only be used in a ticket text channel.' });
    return;
  }

  await channel.permissionOverwrites.edit(ownerId, {
    ViewChannel: false,
    SendMessages: false
  }).catch((err) => logToConsole('Failed to update ticket user permissions', err));

  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
    SendMessages: false,
    ViewChannel: false
  }).catch((err) => logToConsole('Failed to lock @everyone in ticket', err));

  await channel.setName(`closed-${channel.name}`.slice(0, 95)).catch((err) => logToConsole('Failed to rename ticket', err));

  await interaction.editReply({ content: `🔒 Ticket closed by ${interaction.user.tag}.`, components: [] });
  console.log(`Ticket ${channel.id} closed by ${interaction.user.id}`);
}

async function sendWelcomeMessage(member) {
  if (member.user.bot || welcomeCache.has(member.id)) return;
  welcomeCache.add(member.id);

  const guild = member.guild;
  const targetChannel = guild.systemChannel || guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
  );

  if (!targetChannel) return;

  await targetChannel.send({
    content: `Welcome <@${member.id}> to **HyperChat**. Choose one option to get started:`,
    components: [buildWelcomeButtons()]
  }).catch((error) => logToConsole('Failed to send welcome message', error));
}

// ============================================================
// Discord event handlers
// ============================================================
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== config.guildId) return;
  await sendWelcomeMessage(member);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) return;

    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ ephemeral: true });

      if (interaction.commandName === 'apply') {
        await handleApply(interaction);
      } else if (interaction.commandName === 'activate') {
        await handleActivateCommand(interaction);
      } else if (interaction.commandName === 'support') {
        const { channel, created } = await createSupportTicket(interaction, interaction.user);
        await interaction.editReply({
          content: created
            ? `Support ticket created: ${channel}`
            : `You already have an open support ticket: ${channel}`
        });
      }

      return;
    }

    if (!interaction.isButton()) return;

    await interaction.deferReply({ ephemeral: true });

    if (interaction.customId === customIds.apply) {
      await interaction.editReply({ content: 'Use the `/apply` command to submit your creator application.' });
      return;
    }

    if (interaction.customId === customIds.learn) {
      await interaction.editReply({ content: 'HyperChat helps creators engage, monetize, and scale community experiences. Use `/apply` to join.' });
      return;
    }

    if (interaction.customId === customIds.support) {
      const { channel, created } = await createSupportTicket(interaction, interaction.user);
      await interaction.editReply({
        content: created
          ? `Support ticket created: ${channel}`
          : `You already have an open support ticket: ${channel}`
      });
      return;
    }

    const approveId = extractIdFromCustomId(interaction.customId, customIds.approvePrefix);
    if (approveId) {
      await handleApproveButton(interaction, approveId);
      return;
    }

    const rejectId = extractIdFromCustomId(interaction.customId, customIds.rejectPrefix);
    if (rejectId) {
      await handleRejectButton(interaction, rejectId);
      return;
    }

    const closeTicketOwner = extractIdFromCustomId(interaction.customId, customIds.closeTicketPrefix);
    if (closeTicketOwner) {
      await handleTicketClose(interaction, closeTicketOwner);
    }
  } catch (error) {
    console.error('Interaction handler error:', error);

    if (!interaction.isRepliable()) return;

    const message = 'An error occurred while processing this action. The team has been notified.';

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => null);
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => null);
    }
  }
});

// ============================================================
// Process-level reliability guards
// ============================================================
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

client.login(config.token).catch((error) => {
  console.error('Failed to login bot:', error);
  process.exit(1);
});
