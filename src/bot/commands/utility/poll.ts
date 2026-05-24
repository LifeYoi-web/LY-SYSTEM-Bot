import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('إنشاء تصويت سريع')
    .addStringOption((o) => o.setName('question').setDescription('سؤال التصويت').setRequired(true))
    .addStringOption((o) => o.setName('option1').setDescription('خيار 1'))
    .addStringOption((o) => o.setName('option2').setDescription('خيار 2'))
    .addStringOption((o) => o.setName('option3').setDescription('خيار 3'))
    .addStringOption((o) => o.setName('option4').setDescription('خيار 4')),

  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString('question', true);
    const options = (['option1', 'option2', 'option3', 'option4'] as const)
      .map((k) => interaction.options.getString(k))
      .filter((v): v is string => Boolean(v));

    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('📊 ' + question)
      .setFooter({ text: `بواسطة ${interaction.user.username}` })
      .setTimestamp();

    if (options.length) {
      embed.setDescription(options.map((o, i) => `${NUMBERS[i]} ${o}`).join('\n'));
    } else {
      embed.setDescription('✅ موافق  •  ❌ غير موافق');
    }

    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();
    const reactions = options.length ? NUMBERS.slice(0, options.length) : ['✅', '❌'];
    for (const r of reactions) await msg.react(r).catch(() => undefined);
  },
};
