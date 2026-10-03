const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const supabase = require('../supabase');
const { log } = require('../utils/logger');

function sanitize(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 90);
}

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!adminRole || !member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const targetUser = interaction.options.getUser('user');
  if (!targetUser) {
    return interaction.editReply({ content: '❌ Please mention a user.' });
  }

  // 1) Get the application record (the username used when the channel was created)
  const { data: application } = await supabase
    .from('creator_applications')
    .select('id, status, username')
    .eq('discord_id', targetUser.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // 2) Locate their onboarding text channel
  let onboardingChannel = null;

  if (application && application.username) {
    onboardingChannel = interaction.guild.channels.cache.find(
      c => c.isTextBased() && c.name === `onboarding-${sanitize(application.username)}`
    );
  }

  // Fallback: any onboarding-* text channel where this user has a permission overwrite
  if (!onboardingChannel) {
    onboardingChannel = interaction.guild.channels.cache.find(
      c =>
        c.isTextBased() &&
        c.name.startsWith('onboarding-') &&
        !c.name.startsWith('onboarding-voice-') &&
        c.permissionOverwrites.cache.has(targetUser.id)
    );
  }

  if (!onboardingChannel) {
    return interaction.editReply({
      content: `❌ Could not find an onboarding channel for **${targetUser.username}**.`,
    });
  }

  // 3) Send the exact same welcome message as the approval flow
  try {
    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_onboarding_${targetUser.id}`)
        .setLabel('Close Onboarding')
        .setStyle(ButtonStyle.Danger)
    );

    await onboardingChannel.send({
      content:
        `👋 Welcome <@${targetUser.id}>! Your application has been approved.\n\n` +
        `This is your onboarding channel. Our team will use this space to guide you through the setup after your scheduled call.\n\n` +
        `**Check your DMs** to schedule your onboarding call.\n\n` +
        `An admin will close this channel once onboarding is complete.`,
      components: [closeRow],
    });

    await log(
      interaction.client,
      'Welcome Resent',
      `**${interaction.user.username}** resent the onboarding welcome message for **${targetUser.username}** in <#${onboardingChannel.id}>.`,
      0x57f287
    );

    return interaction.editReply({
      content: `✅ Welcome message sent to <#${onboardingChannel.id}> for ${targetUser.username}.`,
    });
  } catch (err) {
    console.error('Resend welcome SEND error:', err);
    return interaction.editReply({
      content: `❌ Failed to send the message to <#${onboardingChannel.id}>: ${err.message}\n\n⚠️ Check the bot has **Send Messages** permission in that channel/category.`,
    });
  }
};
