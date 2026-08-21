const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const supabase = require('../supabase');
const { log } = require('../utils/logger');

async function getAvailableOnboardingCategory(guild) {
  const categoryIds = [
    process.env.ONBOARDING_CATEGORY_ID,
    process.env.ONBOARDING_CATEGORY_ID_2,
  ].filter(Boolean);

  for (const catId of categoryIds) {
    const category = guild.channels.cache.get(catId);
    if (!category) continue;
    const childCount = guild.channels.cache.filter(ch => ch.parentId === catId).size;
    if (childCount < 50) {
      return catId;
    }
  }

  return categoryIds[0];
}

module.exports = async (interaction) => {
  const customId = interaction.customId;
  const isApprove = customId.startsWith('approve_');
  const isReject = customId.startsWith('reject_');
  const isRejectSubmit = customId.startsWith('reject_reason_');

  if (isRejectSubmit) {
    const discordId = customId.split('_')[2];
    const reason = interaction.fields.getTextInputValue('rejection_reason');

    await interaction.deferReply({ flags: 64 });

    const { data: application, error } = await supabase
      .from('creator_applications')
      .select('id, status, username')
      .eq('discord_id', discordId)
      .eq('status', 'pending')
      .single();

    if (error || !application) {
      return interaction.editReply({ content: '❌ Application no longer exists or already reviewed.' });
    }

    await supabase
      .from('creator_applications')
      .update({ status: 'rejected' })
      .eq('id', application.id);

    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (member) {
      const guestRole = interaction.guild.roles.cache.get(process.env.GUEST_ROLE_ID);
      if (guestRole && member.roles.cache.has(guestRole.id)) {
        await member.roles.remove(guestRole);
      }
      try {
        await member.user.send(
          `❌ **Your HyperChat creator application has been rejected.**\n\n` +
          `**Reason:** ${reason}\n\n` +
          `You may apply again after 24 hours. If you have questions, please contact our support team.`
        );
      } catch {
        console.warn(`Could not DM user ${application.username} — DMs may be disabled.`);
      }
    }

    await interaction.message.edit({
      content: `❌ Rejected by ${interaction.user.username} — Reason: ${reason}`,
      components: [],
    });

    await log(
      interaction.client,
      'Application Rejected',
      `**${application.username}** (${discordId}) rejected by **${interaction.user.username}**.\n**Reason:** ${reason}`,
      0xff0000
    );

    return interaction.editReply({
      content: `✅ Application from ${application.username} rejected. Reason sent via DM.`,
    });
  }

  if (!isApprove && !isReject) return;

  const discordId = customId.split('_')[1];

  if (isReject) {
    const modal = new ModalBuilder()
      .setCustomId(`reject_reason_${discordId}`)
      .setTitle('Rejection Reason');

    const reasonInput = new TextInputBuilder()
      .setCustomId('rejection_reason')
      .setLabel('Why is this application being rejected?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the reason for rejection...')
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }

  await interaction.deferReply({ flags: 64 });

  const { data: application, error } = await supabase
    .from('creator_applications')
    .select('id, status, username')
    .eq('discord_id', discordId)
    .eq('status', 'pending')
    .single();

  if (error || !application) {
    return interaction.editReply({
      content: '❌ This application has already been reviewed or no longer exists.',
    });
  }

  if (isApprove) {
    const member = await interaction.guild.members.fetch(discordId).catch(() => null);

    if (!member) {
      return interaction.editReply({ content: '❌ User is no longer in the server.' });
    }

    const creatorPendingRole = interaction.guild.roles.cache.get(process.env.CREATOR_PENDING_ROLE_ID);
    const guestRole = interaction.guild.roles.cache.get(process.env.GUEST_ROLE_ID);
    const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');
    const reviewerRole = interaction.guild.roles.cache.find(r => r.name === 'Reviewer');

    if (!creatorPendingRole) {
      return interaction.editReply({ content: '❌ Creator Pending role not found.' });
    }

    if (guestRole && member.roles.cache.has(guestRole.id)) {
      await member.roles.remove(guestRole);
    }
    await member.roles.add(creatorPendingRole);

    await supabase
      .from('creator_applications')
      .update({ status: 'approved_pending' })
      .eq('id', application.id);

    try {
      const scheduleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`schedule_${discordId}`)
          .setLabel('Schedule Onboarding Call')
          .setStyle(ButtonStyle.Primary)
      );

      await member.user.send({
        content:
          '🎉 Congratulations! Your HyperChat creator application has been approved!\n\n' +
          'To complete your onboarding, please schedule a call with our team by clicking the button below.',
        components: [scheduleRow],
      });
    } catch {
      console.warn(`Could not DM user ${application.username} — DMs may be disabled.`);
    }

    const targetCategoryId = await getAvailableOnboardingCategory(interaction.guild);

    // FIX: Sanitize username to remove underscores and invalid characters
    const safeUsername = application.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 90);

    const onboardingChannel = await interaction.guild.channels.create({
      name: `onboarding-${safeUsername}`,
      type: ChannelType.GuildText,
      parent: targetCategoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });

    const adminRole2 = interaction.guild.roles.cache.find(r => r.name === 'Admin');
    const reviewerRole2 = interaction.guild.roles.cache.find(r => r.name === 'Reviewer');

    if (adminRole2) await onboardingChannel.permissionOverwrites.create(adminRole2, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    if (reviewerRole2) await onboardingChannel.permissionOverwrites.create(reviewerRole2, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

    const onboardingVoice = await interaction.guild.channels.create({
      name: `onboarding-voice-${safeUsername}`,
      type: ChannelType.GuildVoice,
      parent: targetCategoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
      ],
    });

    if (adminRole2) await onboardingVoice.permissionOverwrites.create(adminRole2, { ViewChannel: true, Connect: true, Speak: true });
    if (reviewerRole2) await onboardingVoice.permissionOverwrites.create(reviewerRole2, { ViewChannel: true, Connect: true, Speak: true });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_onboarding_${discordId}`)
        .setLabel('Close Onboarding')
        .setStyle(ButtonStyle.Danger)
    );

    await onboardingChannel.send({
      content:
        `👋 Welcome <@${discordId}>! Your application has been approved.\n\n` +
        `This is your onboarding channel. Our team will use this space to guide you through the setup after your scheduled call.\n\n` +
        `**Check your DMs** to schedule your onboarding call.\n\n` +
        `You also have access to the voice channel **onboarding-voice-${safeUsername}** above for your call.\n\n` +
        `An admin will close this channel once onboarding is complete.`,
      components: [closeRow],
    });

    await interaction.message.edit({
      content: `✅ Approved by ${interaction.user.username} — DM sent + onboarding channels created`,
      components: [],
    });

    await log(
      interaction.client,
      'Application Approved',
      `**${application.username}** (${discordId}) approved by **${interaction.user.username}**.\nOnboarding channel: <#${onboardingChannel.id}>`,
      0x57f287
    );

    return interaction.editReply({
      content: `✅ Approved ${application.username}! DM sent + onboarding channels created: <#${onboardingChannel.id}>`,
    });
  }
};
