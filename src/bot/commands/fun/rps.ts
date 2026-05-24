import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

const CHOICES = ['حجر', 'ورقة', 'مقص'] as const;
const EMOJI: Record<string, string> = { حجر: '🪨', ورقة: '📄', مقص: '✂️' };
// index beats (index+1)%3 ... حجر(0) يكسر مقص(2); ورقة(1) تغلف حجر(0); مقص(2) يقص ورقة(1)
const BEATS: Record<string, string> = { حجر: 'مقص', ورقة: 'حجر', مقص: 'ورقة' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('حجر ورقة مقص ضد البوت')
    .addStringOption((o) =>
      o
        .setName('choice')
        .setDescription('اختيارك')
        .setRequired(true)
        .addChoices({ name: 'حجر', value: 'حجر' }, { name: 'ورقة', value: 'ورقة' }, { name: 'مقص', value: 'مقص' }),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const you = interaction.options.getString('choice', true);
    const bot = CHOICES[Math.floor(Math.random() * 3)];
    const result = you === bot ? '🤝 تعادل!' : BEATS[you] === bot ? '🎉 فزت!' : '😈 خسرت!';
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf57c00)
          .setTitle('🪨📄✂️ حجر ورقة مقص')
          .setDescription(`أنت: ${EMOJI[you]} ${you}\nالبوت: ${EMOJI[bot]} ${bot}\n\n**${result}**`),
      ],
    });
  },
};
