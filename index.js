const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const ALERT_ROLE_IDS = [
  '1476924303277822042',
  '1476924829067247646'
];

const REVIEWER_IDS = [
  '532448115861749770'
];

const CREATOR_ROLE_NAME = 'Creator';
const PENDING_ROLE_NAME = 'Creator-Pending';
const ONBOARD_CATEGORY = 'Onboarding Sessions';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =================================================
// COMMAND
// =================================================
const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for Creator access')
    .addStringOption(o =>
      o.setName('details')
        .setDescription('Channel link + intro')
        .setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =================================================
// INTERACTIONS
// =================================================
client.on('interactionCreate', async interaction => {

  // =================================================
  // BUTTONS
  // =================================================
  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');

    if (!['claim', 'approve', 'reject'].includes(action)) return;

    await interaction.deferUpdate();

    const { data: app } = await supabase
      .from('creator_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (!app) return;

    // ================= CLAIM =================
    if (action === 'claim') {

      if (app.assigned_to) return;

      await supabase
        .from('creator_applications')
        .update({
          assigned_to: interaction.user.id,
          status: 'review'
        })
        .eq('id', id);

      return interaction.editReply({
        content: `🟡 CLAIMED by ${interaction.user.tag}`,
        components: interaction.message.components
      });
    }

    // ================= APPROVE =================
    if (action === 'approve') {

      const guild = interaction.guild;
      const member =
        await guild.members.fetch(app.discord_id);

      const pendingRole =
        guild.roles.cache.find(
          r => r.name === PENDING_ROLE_NAME
        );

      if (!pendingRole)
        return interaction.editReply({
          content: 'Creator-Pending role missing.',
          components: []
        });

      await member.roles.add(pendingRole).catch(() => {});

      // 🔥 FIND OR CREATE CATEGORY
      let category = guild.channels.cache.find(
        c =>
          c.name === ONBOARD_CATEGORY &&
          c.type === ChannelType.GuildCategory
      );

      if (!category) {
        category = await guild.channels.create({
          name: ONBOARD_CATEGORY,
          type: ChannelType.GuildCategory
        });
      }

      // 🔒 PERMISSIONS
      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: member.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ];

      // 👥 TEAM ACCESS
      ALERT_ROLE_IDS.forEach(roleId => {
        overwrites.push({
          id: roleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.SendMessages
          ]
        });
      });

      // 🎤 CREATE VOICE CHANNEL
      const voice = await guild.channels.create({
        name: `Onboarding — ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: overwrites
      });

      // 💬 CREATE TEXT CHANNEL
      const text = await guild.channels.create({
        name: `onboarding-${member.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites
      });

      // 📣 MESSAGE TO CREATOR
      await text.send(
`${member} 👋

Your application was approved.

Join the voice channel when ready for live setup:

🔊 ${voice}`
      );

      // 📣 NOTIFY TEAM
      const roleMentions = ALERT_ROLE_IDS
        .map(id => `<@&${id}>`)
        .join(' ');

      await text.send(
`${roleMentions}

New onboarding session created.`
      );

      await supabase
        .from('creator_applications')
        .update({ status: 'onboarding' })
        .eq('id', id);

      return interaction.editReply({
        content: `🟢 APPROVED → Onboarding room created`,
        components: []
      });
    }

    // ================= REJECT =================
    if (action === 'reject') {

      await supabase
        .from('creator_applications')
        .update({ status: 'rejected' })
        .eq('id', id);

      return interaction.editReply({
        content: `❌ REJECTED`,
        components: []
      });
    }
  }

  // =================================================
  // /apply
  // =================================================
  if (interaction.isChatInputCommand() &&
      interaction.commandName === 'apply') {

    await interaction.deferReply({ flags: 64 });

    const details = interaction.options.getString('details');

    const { data } = await supabase
      .from('creator_applications')
      .insert({
        discord_id: interaction.user.id,
        username: interaction.user.tag,
        content: details
      })
      .select()
      .single();

    const channel =
      interaction.guild.channels.cache.find(
        c => c.name === 'creator-applications'
      );

    if (!channel)
      return interaction.editReply({
        content: 'Applications channel missing.'
      });

    const roleMentions = ALERT_ROLE_IDS
      .map(id => `<@&${id}>`)
      .join(' ');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${data.id}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),

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
`${roleMentions}

📩 New Creator Application

User: ${interaction.user.tag}

${details}`,
      components: [row],
      allowedMentions: { roles: ALERT_ROLE_IDS }
    });

    for (const id of REVIEWER_IDS) {
      try {
        const u = await client.users.fetch(id);
        await u.send(
          `New creator application from ${interaction.user.tag}`
        );
      } catch {}
    }

    await interaction.editReply({
      content: 'Application submitted.'
    });
  }
});

// =================================================
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
