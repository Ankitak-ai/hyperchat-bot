const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
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
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.editReply({ content: '❌ User not found in this server.' });
  }

  // 1. Role Management (Happens regardless of DB application status)
  const creatorRole = interaction.guild.roles.cache.get(process.env.CREATOR_ROLE_ID);
  const creatorPendingRole = interaction.guild.roles.cache.get(process.env.CREATOR_PENDING_ROLE_ID);
  const scheduledRole = interaction.guild.roles.cache.get(process.env.SCHEDULED_ROLE_ID);
  const guestRole = interaction.guild.roles.cache.get(process.env.GUEST_ROLE_ID);

  if (!creatorRole) {
    return interaction.editReply({ content: '❌ Could not find the Creator role. Check CREATOR_ROLE_ID in .env.' });
  }

  if (creatorPendingRole && targetMember.roles.cache.has(creatorPendingRole.id)) await targetMember.roles.remove(creatorPendingRole).catch(console.error);
  if (scheduledRole && targetMember.roles.cache.has(scheduledRole.id)) await targetMember.roles.remove(scheduledRole).catch(console.error);
  if (guestRole && targetMember.roles.cache.has(guestRole.id)) await targetMember.roles.remove(guestRole).catch(console.error);
  await targetMember.roles.add(creatorRole).catch(console.error);

  // 2. Check DB for application (Optional now)
  let applicationUsername = targetUser.username; // Default fallback
  let manualActivation = false;

  const { data: application } = await supabase
    .from('creator_applications')
    .select('id, status, username')
    .eq('discord_id', targetUser.id)
    .in('status', ['approved_pending', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (application) {
    applicationUsername = application.username;
    const { error } = await supabase
      .from('creator_applications')
      .update({ status: 'approved' })
      .eq('id', application.id);
    if (error) console.error('Supabase update error:', error);
  } else {
    // No DB record found. Insert a manual record to keep DB consistent.
    manualActivation = true;
    const { error: insertError } = await supabase.from('creator_applications').insert({
      discord_id: targetUser.id,
      username: targetUser.username,
      details: 'Manual activation by Admin via /activate',
      status: 'approved',
    });
    if (insertError) console.error('Supabase manual insert error:', insertError);
  }

  // 3. Cleanup onboarding channels (if any exist)
  const safeUsername = sanitize(applicationUsername);
  
  let onboardingText = interaction.guild.channels.cache.find(
    c => c.name === `onboarding-${safeUsername}` && c.isTextBased()
  );
  let onboardingVoice = interaction.guild.channels.cache.find(
    c => c.name === `onboarding-voice-${safeUsername}` && c.isVoice()
  );

  // Fallback: find by permission overwrite if name doesn't match
  if (!onboardingText) {
    onboardingText = interaction.guild.channels.cache.find(
      c => c.isTextBased() && c.name.startsWith('onboarding-') && !c.name.includes('voice') && c.permissionOverwrites.cache.has(targetUser.id)
    );
  }
  if (!onboardingVoice) {
    onboardingVoice = interaction.guild.channels.cache.find(
      c => c.isVoice() && c.name.startsWith('onboarding-voice-') && c.permissionOverwrites.cache.has(targetUser.id)
    );
  }

  if (onboardingText) {
    await onboardingText.send('✅ Onboarding complete! This channel will be deleted in 10 seconds.').catch(() => {});
    setTimeout(() => onboardingText.delete().catch(console.error), 10_000);
  }
  if (onboardingVoice) {
    setTimeout(() => onboardingVoice.delete().catch(console.error), 10_000);
  }

  // 4. Create private hc- channel
  const creatorsChatCategory =
    interaction.guild.channels.cache.get(process.env.CREATORS_CHAT_CATEGORY_ID) ||
    interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name === 'creators-chat'
    );

  let creatorChannel;
  try {
    creatorChannel = await interaction.guild.channels.create({
      name: `hc-${safeUsername}`,
      type: ChannelType.GuildText,
      parent: creatorsChatCategory ? creatorsChatCategory.id : process.env.CREATOR_CATEGORY_ID,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: targetUser.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: interaction.guild.members.me.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });

    if (adminRole) {
      await creatorChannel.permissionOverwrites.create(adminRole, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      }).catch(console.error);
    }
  } catch (err) {
    console.error('Activate channel CREATE error:', err);
    return interaction.editReply({ content: `❌ Failed to create channel: ${err.message}` });
  }

  // 5. Send welcome message
  let messageSent = false;
  try {
    await creatorChannel.send(
      `👋 Hey <@${targetUser.id}>! Welcome to your private HyperChat channel.\n\n` +
      `This is your dedicated space to connect with the HyperChat team. Use this channel for:\n` +
      `📌 Setup help\n` +
      `🐛 Issues or bugs\n` +
      `💡 Feature requests\n` +
      `📢 Important updates from the team\n\n` +
      `Welcome aboard! 🚀`
    );
    messageSent = true;
  } catch (err) {
    console.error('Activate channel SEND error:', err);
    await log(interaction.client, 'Channel Message Failed', `Created <#${creatorChannel.id}> for **${targetUser.username}** but could not send the welcome message.\n**Reason:** ${err.message}`, 0xffa500);
  }

  // 6. Post in #new-creators
  try {
    const newCreatorsChannel = await interaction.client.channels.fetch(process.env.NEW_CREATORS_CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setTitle('🎉 New Creator!')
      .setDescription(`Welcome <@${targetUser.id}> to the HyperChat creator family!`)
      .setColor(0x57f287)
      .setTimestamp();
    await newCreatorsChannel.send({ embeds: [embed] }).catch(console.error);
  } catch {
    console.warn('Could not post to #new-creators.');
  }

  // 7. DM the user
  try {
    await targetUser.send(
      '🎉 Congratulations! Your HyperChat creator account has been fully activated!\n\n' +
      'You now have access to:\n' +
      '🎙️ **Creator Lounge** — voice channel for creators\n' +
      '📢 **#announcements** — stay updated with HyperChat news\n' +
      '💬 **#creators-chat** — chat with other creators\n' +
      `🔒 **<#${creatorChannel.id}>** — your private channel with the team\n` +
      '🎫 **Support tickets** — get help anytime\n\n' +
      'Welcome to the team!'
    );
  } catch {
    console.warn(`Could not DM user ${targetUser.username} — DMs may be disabled.`);
  }

  // 8. Log and reply
  await log(
    interaction.client,
    'Creator Activated',
    `**${targetUser.username}** (${targetUser.id}) activated as Creator by **${interaction.user.username}**.\nPrivate channel: <#${creatorChannel.id}>${manualActivation ? '\n*(Manual activation - no prior application found)*' : ''}`,
    0x57f287
  );

  return interaction.editReply({
    content: messageSent
      ? `✅ Successfully activated ${targetUser.username} as a Creator! Private channel: <#${creatorChannel.id}>`
      : `⚠️ Activated ${targetUser.username} and created <#${creatorChannel.id}>, but the welcome message failed to send (check bot permissions / logs).`,
  });
};
