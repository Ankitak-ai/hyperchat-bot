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

// 🔴 PUT YOUR ROLE IDs HERE
const ALERT_ROLE_IDS = [
  '1476924303277822042',
  '1476924829067247646',
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

// ===== COMMAND =====
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

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {

  // ================= APPLY =================
  if (interaction.isChatInputCommand() &&
      interaction.commandName === 'apply') {

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
      return interaction.reply({
        content: 'Staff channel not configured.',
        ephemeral: true
      });

    // ===== BUTTONS =====
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

    // ===== BUILD MULTI-ROLE PING STRING =====
    const roleMentions = ALERT_ROLE_IDS
      .map(id => `<@&${id}>`)
      .join(' ');

    // ===== SEND ALERT =====
    const msg = await staffChannel.send({
      content:
`${roleMentions}

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

    await interaction.reply({
      content: 'Application submitted.',
      ephemeral: true
    });
  }

  // ================= BUTTON HANDLING =================
  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');

    const { data: app } = await supabase
      .from('creator_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (!app)
      return interaction.reply({
        content: 'Application not found.',
        ephemeral: true
      });

    // ----- CLAIM -----
    if (action === 'claim') {

      if (app.assigned_to)
        return interaction.reply({
          content: 'Already claimed.',
          ephemeral: true
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

    // ----- APPROVE -----
    if (action === 'approve') {

      const member =
        await interaction.guild.members.fetch(app.discord_id);

      const creatorRole =
        interaction.guild.roles.cache.find(r => r.name === 'Creator');

      if (!creatorRole)
        return interaction.reply({
          content: 'Creator role not found.',
          ephemeral: true
        });

      try {
        await member.roles.add(creatorRole);
      } catch {
        return interaction.reply({
          content: 'Role assignment failed.',
          ephemeral: true
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

    // ----- REJECT -----
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
});

// ===== START =====
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
