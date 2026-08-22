const supabase = require('../supabase');
const { log } = require('../utils/logger');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

// In-memory cache to pass data between Step 1 and Step 2
const applicationCache = new Map();

module.exports = async (interaction) => {
  // If triggered via slash (fallback)
  if (interaction.isChatInputCommand()) {
    return interaction.reply({
      content: 'Use the Apply button in #welcome.',
      flags: 64,
    });
  }

  // 1. Initial Button Click -> Show Info Screen
  if (interaction.isButton() && interaction.customId === 'start_apply') {
    const infoEmbed = new EmbedBuilder()
      .setTitle('🚀 Become a HyperChat Creator')
      .setColor(0x5865f2)
      .setDescription(
        'Welcome to HyperChat! Before you apply, please review our platform benefits and requirements:\n\n' +
        '💰 **Revenue Share:** 89% goes directly to you, 11% platform fee.\n' +
        '📅 **Payouts:** Processed in the first week of every month.\n' +
        '🏦 **Requirements:** A valid UPI ID and Email address are required for payouts.\n' +
        '▶️ **YouTube:** You must provide a valid YouTube channel/video link.\n' +
        '📸 **Instagram:** Optional, but helps us know you better!\n\n' +
        'Click below to start your application.'
      )
      .setFooter({ text: 'HyperChat • Built for Creators' });

    const infoRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apply_step1')
        .setLabel('I Understand — Apply')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel_apply')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [infoEmbed], components: [infoRow], flags: 64 });
  }

  // 2. Cancel Button
  if (interaction.isButton() && interaction.customId === 'cancel_apply') {
    return interaction.reply({ content: '❌ Application cancelled.', flags: 64 });
  }

  // 3. Step 1 Button -> Show Modal 1
  if (interaction.isButton() && interaction.customId === 'apply_step1') {
    const modal = new ModalBuilder()
      .setCustomId('apply_modal_1')
      .setTitle('Step 1: Creator Info');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Your Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const youtubeInput = new TextInputBuilder()
      .setCustomId('youtube')
      .setLabel('YouTube Channel Link')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://youtube.com/@yourchannel')
      .setRequired(true);

    const instagramInput = new TextInputBuilder()
      .setCustomId('instagram')
      .setLabel('Instagram Handle (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('@handle')
      .setRequired(false);

    const nicheInput = new TextInputBuilder()
      .setCustomId('niche')
      .setLabel('Your Content Niche')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('e.g. Gaming, Tech Reviews, Vlogs')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(youtubeInput),
      new ActionRowBuilder().addComponents(instagramInput),
      new ActionRowBuilder().addComponents(nicheInput)
    );

    return interaction.showModal(modal);
  }

  // 4. Step 2 Button -> Show Modal 2
  // (Discord cannot open a modal right after a modal submit, so we use this button as the bridge)
  if (interaction.isButton() && interaction.customId === 'apply_step2') {
    if (!applicationCache.has(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Session expired. Please start over with the Apply button.',
        flags: 64,
      });
    }

    const modal2 = new ModalBuilder()
      .setCustomId('apply_modal_2')
      .setTitle('Step 2: Payout Info');

    const upiInput = new TextInputBuilder()
      .setCustomId('upi_id')
      .setLabel('UPI ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('yourname@upi')
      .setRequired(true);

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel('Email Address')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('you@example.com')
      .setRequired(true);

    modal2.addComponents(
      new ActionRowBuilder().addComponents(upiInput),
      new ActionRowBuilder().addComponents(emailInput)
    );

    return interaction.showModal(modal2);
  }

  // 5. Modal 1 submit -> Validate YT link, cache data, show Step 2 button
  if (interaction.isModalSubmit() && interaction.customId === 'apply_modal_1') {
    const youtube = interaction.fields.getTextInputValue('youtube');

    // Validate YouTube link
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i;
    if (!ytRegex.test(youtube)) {
      return interaction.reply({
        content: '❌ Please provide a valid YouTube link (e.g., https://youtube.com/@yourchannel)',
        flags: 64,
      });
    }

    // Cache the data temporarily
    applicationCache.set(interaction.user.id, {
      name: interaction.fields.getTextInputValue('name'),
      youtube: youtube,
      instagram: interaction.fields.getTextInputValue('instagram'),
      niche: interaction.fields.getTextInputValue('niche'),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apply_step2')
        .setLabel('Continue to Step 2: Payout Info')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({
      content: '✅ Step 1 complete! Click the button below to enter your payout details.',
      components: [row],
      flags: 64,
    });
  }

  // 6. Modal 2 submit -> Finalize & Save to DB
  if (interaction.isModalSubmit() && interaction.customId === 'apply_modal_2') {
    await interaction.deferReply({ flags: 64 });

    const discordId = interaction.user.id;
    const username = interaction.user.username;

    const upiId = interaction.fields.getTextInputValue('upi_id');
    const email = interaction.fields.getTextInputValue('email');

    // Validate Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return interaction.editReply({ content: '❌ Please provide a valid email address.' });
    }

    // Retrieve cached data from Step 1
    const cachedData = applicationCache.get(discordId);
    if (!cachedData) {
      return interaction.editReply({
        content: '❌ Session expired. Please start over with the Apply button.',
      });
    }
    applicationCache.delete(discordId);

    const { name, youtube, instagram, niche } = cachedData;

    // Rate limit check
    const { data: recent } = await supabase
      .from('creator_applications')
      .select('created_at, status')
      .eq('discord_id', discordId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recent) {
      if (['pending', 'approved_pending'].includes(recent.status)) {
        return interaction.editReply({
          content: '❌ You already have an active application.',
        });
      }

      if (recent.status === 'rejected') {
        const hoursSince =
          (Date.now() - new Date(recent.created_at)) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return interaction.editReply({
            content: '❌ You can reapply after 24 hours.',
          });
        }
      }
    }

    const details = `
**Name:** ${name}
**YouTube:** ${youtube}
**Instagram:** ${instagram || 'Not provided'}
**Niche:** ${niche}
**UPI ID:** ${upiId}
**Email:** ${email}
`;

    const { error } = await supabase
      .from('creator_applications')
      .insert({
        discord_id: discordId,
        username,
        details,
        email,
        upi_id: upiId,
        status: 'pending',
      });

    if (error) {
      await log(
        interaction.client,
        'Application Error',
        `${username} failed: ${error.message}`,
        0xff0000
      );
      return interaction.editReply({
        content: '❌ Submission failed.',
      });
    }

    // Assign Guest role
    const guestRole = interaction.guild.roles.cache.get(
      process.env.GUEST_ROLE_ID
    );
    if (guestRole && !interaction.member.roles.cache.has(guestRole.id)) {
      await interaction.member.roles.add(guestRole).catch(console.error);
    }

    // Send to applications channel
    const channel = await interaction.client.channels.fetch(
      process.env.APPLICATION_CHANNEL_ID
    );

    const embed = new EmbedBuilder()
      .setTitle('New Creator Application')
      .setColor(0x5865f2)
      .setDescription(details)
      .addFields(
        { name: 'Username', value: username, inline: true },
        { name: 'Discord ID', value: discordId, inline: true },
        { name: 'Email', value: email, inline: true },
        { name: 'UPI ID', value: upiId, inline: true }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${discordId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_${discordId}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    await log(
      interaction.client,
      'Application Submitted',
      `${username} applied`,
      0x5865f2
    );

    return interaction.editReply({
      content: '✅ Application submitted successfully. Please wait for a review!',
    });
  }
};
