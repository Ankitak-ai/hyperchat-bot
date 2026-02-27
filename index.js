const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

// ===== ENV =====
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
  '532448115861749770',
  '532448115861749770'
];


// ===== SUPABASE =====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================================================
// SLASH COMMAND: /apply
// =====================================================
const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for Creator access')
    .addStringOption(o =>
      o.setName('details')
        .setDescription('Channel link + short intro')
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

// =====================================================
// READY
// =====================================================
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =====================================================
// CLEAN INTERACTIVE WELCOME MESSAGE
// =====================================================
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
      .setLabel('Visit Website')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.hyperchat.site/'),

    new ButtonBuilder()
      .setCustomId('support_info')
      .setLabel('Get Support')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    content:
`👋 **Welcome ${member}!**

**HyperChat** helps creators turn live streams into interactive experiences using text, voice, sound, and image alerts.

🎥 **Creators:** Apply to enable monetization and engagement tools  
👀 **Community:** Stay and explore

Choose an option below 👇`,
    components: [row]
  });
});

// =====================================================
// INTERACTIONS
// =====================================================
client.on('interactionCreate', async interaction => {

  // ---------------------------------------------------
  // BUTTON ACTIONS (WELCOME)
  // ---------------------------------------------------
  if (interaction.isButton()) {

    if (interaction.customId === 'start_apply') {
      return interaction.reply({
        content:
'Use the `/apply` command and include your channel link + intro.',
        flags: 64
      });
    }

    if (interaction.customId === 'support_info') {
      return interaction.reply({
        content:
'Contact the HyperChat team in the support channel.',
        flags: 64
      });
    }

    // =================================================
    // APPLICATION BUTTON HANDLING
    // =================================================
    const [action, id] = interaction.customId.split('_');

    const { data: app } = await supabase
      .from('creator_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (!app)
      return interaction.reply({
        content: 'Application not found.',
        flags: 64
      });

    // ---------- CLAIM ----------
    if (action === 'claim') {

      if (app.assigned_to)
        return interaction.reply({
          content: 'Already claimed.',
          flags: 64
        });

      await supabase
        .from('creator_applications')
        .update({
          assigned_to: interaction.user.id,
          status: 'in_review'
        })
        .eq('id', id);

      return interaction.update({
        content:
`🟡 CLAIMED by ${interaction.user.tag}

User: ${app.username}

Details:
${app.content}`,
        components: interaction.message.components
      });
    }

    // ---------- APPROVE ----------
    if (action === 'approve') {

      const member =
        await interaction.guild.members.fetch(app.discord_id);

      const role =
        interaction.guild.roles.cache.find(
          r => r.name === 'Creator'
        );

      if (!role)
        return interaction.reply({
          content: 'Creator role not found.',
          flags: 64
        });

      try {
        await member.roles.add(role);
      } catch {
        return interaction.reply({
          content: 'Cannot assign role. Check permissions.',
          flags: 64
        });
      }

      await supabase
        .from('creator_applications')
        .update({ status: 'approved' })
        .eq('id', id);

      try {
        await member.send(
          'Your HyperChat Creator application has been approved.'
        );
      } catch {}

      return interaction.update({
        content:
`✅ APPROVED by ${interaction.user.tag}

User: ${app.username}`,
        components: []
      });
    }

    // ---------- REJECT ----------
    if (action === 'reject') {

      await supabase
        .from('creator_applications')
        .update({ status: 'rejected' })
        .eq('id', id);

      return interaction.update({
        content:
`❌ REJECTED by ${interaction.user.tag}

User: ${app.username}`,
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
        content: details,
        status: 'pending'
      })
      .select()
      .single();

    const staffChannel =
      interaction.guild.channels.cache.find(
        c => c.name === 'creator-applications'
      );

    if (!staffChannel)
      return interaction.editReply({
        content: 'Staff channel not configured.'
      });

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

    const mentions = ALERT_ROLE_IDS
      .map(id => `<@&${id}>`)
      .join(' ');

    const msg = await staffChannel.send({
      content:
`${mentions}

📩 **New Creator Application**

User: ${interaction.user.tag}
ID: ${interaction.user.id}

Details:
${details}

Status: Pending`,
      allowedMentions: { roles: ALERT_ROLE_IDS },
      components: [row]
    });

    await supabase
      .from('creator_applications')
      .update({ message_id: msg.id })
      .eq('id', data.id);

    // DM reviewers
    for (const id of REVIEWER_IDS) {
      try {
        const user = await client.users.fetch(id);
        await user.send(
`📩 New HyperChat Creator Application

Applicant: ${interaction.user.tag}
Details:
${details}

Check #creator-applications`
        );
      } catch {}
    }

    await interaction.editReply({
      content: 'Application submitted successfully.'
    });
  }
});

// =====================================================
// START
// =====================================================
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
