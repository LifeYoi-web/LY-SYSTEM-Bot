import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

const ANSWERS = [
  'نعم ✅', 'لا ❌', 'أكيد 💯', 'مستحيل', 'يمكن 🤔', 'اسأل لاحقًا', 'الأفضل ما تعرف الآن',
  'بالتأكيد', 'لا أعتقد', 'كل المؤشرات تقول نعم', 'ركّز وحاول مرة ثانية', 'وارد جدًا',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('اسأل الكرة السحرية')
    .addStringOption((o) => o.setName('question').setDescription('سؤالك').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const q = interaction.options.getString('question', true);
    const a = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xf57c00).setTitle('🎱 الكرة السحرية').addFields(
        { name: 'السؤال', value: q.slice(0, 256) },
        { name: 'الجواب', value: a },
      )],
    });
  },
};
