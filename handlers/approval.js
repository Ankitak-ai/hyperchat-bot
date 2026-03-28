const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const supabase = require('../supabase');
const { log } = require('../utils/logger');

module.exports = async (interaction) => {
  const customId = interaction.customId;
  const isApprove = customId.startsWith('approve_');
  const isReject = customId.startsWith('reject_');

  if (!isApprove && !isReject) return;

  const discordId = customId.split('_')[1];

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

    // 1. DM user with schedule button
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

    // 2. Create onboarding channel
    const onboardingChannel = await interaction.guild.channels.create({
      name: `onboarding-${application.username}`,
      parent: process.env.ONBOARDING_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: discordId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: interaction.guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');
    const reviewerRole = interaction.guild.roles.cache.find(r => r.name === 'Reviewer');
    if (adminRole) {
      await onboardingChannel.permissionOverwrites.create(adminRole, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
    }
    if (reviewerRole) {
      await onboardingChannel.permissionOverwrites.create(reviewerRole, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
    }

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
        `An admin will close this channel once onboarding is complete.`,
      components: [closeRow],
    });

    await interaction.message.edit({
      content: `✅ Approved by ${interaction.user.username} — DM sent + onboarding channel created`,
      components: [],
    });

    await log(
      interaction.client,
      'Application Approved',
      `**${application.username}** (${discordId}) approved by **${interaction.user.username}**.\nOnboarding channel: <#${onboardingChannel.id}>`,
      0x57f287
    );

    return interaction.editReply({
      content: `✅ Approved ${application.username}! DM sent for scheduling + onboarding channel created: <#${onboardingChannel.id}>`,
    });
  }

  if (isReject) {
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
        await member.user.send('❌ Unfortunately your HyperChat creator application has been rejected. You may apply again after 24 hours.');
      } catch {
        console.warn(`Could not DM user ${application.username} — DMs may be disabled.`);
      }
    }

    await interaction.message.edit({
      content: `❌ Rejected by ${interaction.user.username}`,
      components: [],
    });

    await log(
      interaction.client,
      'Application Rejected',
      `**${application.username}** (${discordId}) rejected by **${interaction.user.username}**.`,
      0xff0000
    );

    return interaction.editReply({
      content: `✅ Application from ${application.username} has been rejected.`,
    });
  }
};
