import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('عرض صورة عضو بحجم كبير')
    .addUserOption((o) => o.setName('user').setDescription('العضو (افتراضيًا أنت)')),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle(`🖼️ صورة ${user.username}`)
      .setImage(url)
      .setURL(url)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
