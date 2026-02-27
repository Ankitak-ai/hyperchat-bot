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

// ================= ENV =================
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// 🔴 ALERT ROLES (PINGED)
const ALERT_ROLE_IDS = [
  '1476924303277822042',
  '1476924829067247646'
];

// 🔴 REVIEWERS WHO GET DM ALERTS
const REVIEWER_IDS = [
  '532448115861749770'
];

const CREATOR_ROLE_NAME = 'Creator';
const TICKET_CATEGORY_NAME = 'Support Tickets';

// ================= SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =================================================
// REGISTER COMMAND
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

// =================================================
// READY
// =================================================
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =================================================
// WELCOME MESSAGE
// =================================================
client.on('guildMemberAdd', async member => {

  const channel = member.guild.channels.cache.find(
    c => c.name === 'welcome'
  );
  if (!channel) return;

  const row = new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId('start_apply')
      .setLabel('Apply as Creator')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setLabel('Website')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.hyperchat.site/'),

    new ButtonBuilder()
      .setCustomId('support_ticket')
      .setLabel('Get Support')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    content:
`👋 Welcome ${member}!

HyperChat helps creators turn live streams into interactive experiences using text, voice, sound, and image alerts.

🎥 Creators: Apply to enable monetization tools  
👀 Community: Stay and explore  

Choose an option below 👇`,
    components: [row]
  });
});

// =================================================
// INTERACTIONS
// =================================================
client.on('interactionCreate', async interaction => {

  // ================= BUTTONS =================
  if (interaction.isButton()) {

    // ---------- APPLY INFO ----------
    if (interaction.customId === 'start_apply') {
      return interaction.reply({
        content: 'Use `/apply` with your channel link + intro.',
        flags: 64
      });
    }

    // =================================================
    // SUPPORT TICKET
    // =================================================
    if (interaction.customId === 'support_ticket') {

      await interaction.deferReply({ flags: 64 });

      const guild = interaction.guild;
      const user = interaction.user;

      let category = guild.channels.cache.find(
        c =>
          c.name === TICKET_CATEGORY_NAME &&
          c.type === ChannelType.GuildCategory
      );

      if (!category) {
        category = await guild.channels.create({
          name: TICKET_CATEGORY_NAME,
          type: ChannelType.GuildCategory
        });
      }

      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ];

      const ticket = await guild.channels.create({
        name: `support-${user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites
      });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticket.send({
        content: `${user} Describe your issue.`,
        components: [closeRow]
      });

      return interaction.editReply({
        content: `Ticket created: ${ticket}`
      });
    }

    // ---------- CLOSE TICKET ----------
    if (interaction.customId === 'close_ticket') {

      await interaction.reply({
        content: 'Closing...',
        flags: 64
      });

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 3000);

      return;
    }

    // =================================================
    // APPLICATION BUTTONS
    // =================================================
    const [action, id] = interaction.customId.split('_');

    if (!['claim', 'approve', 'reject'].includes(action)) return;

    await interaction.deferUpdate();

    const { data: app } = await supabase
      .from('creator_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (!app) return;

    // CLAIM
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
        content:
`🟡 CLAIMED by ${interaction.user.tag}

${app.username}
${app.content}`,
        components: interaction.message.components
      });
    }

    // APPROVE
    if (action === 'approve') {

      const member =
        await interaction.guild.members.fetch(app.discord_id);

      const role =
        interaction.guild.roles.cache.find(
          r => r.name === CREATOR_ROLE_NAME
        );

      if (role) await member.roles.add(role).catch(() => {});

      await supabase
        .from('creator_applications')
        .update({ status: 'approved' })
        .eq('id', id);

      try { await member.send('Application approved.'); } catch {}

      return interaction.editReply({
        content: `✅ APPROVED by ${interaction.user.tag}`,
        components: []
      });
    }

    // REJECT
    if (action === 'reject') {

      await supabase
        .from('creator_applications')
        .update({ status: 'rejected' })
        .eq('id', id);

      return interaction.editReply({
        content: `❌ REJECTED by ${interaction.user.tag}`,
        components: []
      });
    }
  }

  // =================================================
  // /apply COMMAND
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

    // DM reviewers
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
