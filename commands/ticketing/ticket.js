const { SlashCommandBuilder } = require('discord.js');

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ChannelType, ButtonInteraction, PermissionsBitField } = require('discord.js');
const { execute } = require('../utility/ping1');


// For the creation of the embed of which users make new tickets, currently there is only one ticket type.

module.exports = {
    data: new SlashCommandBuilder()
    .setName('new_ticket_module')
    .setDescription('Creates the ticket message within the channel this is sent.'),
    async execute (interaction, client){
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await interaction.reply({ content: "You must be an admin to create a ticket embed."})

        const button = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setCustomId('button')
            .setLabel('Create a Ticket')
            .setStyle(ButtonStyle.Secondary)
        )    

        // Creating the embed for the tickets.
        const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("Get in Contact")
        .setDescription("Click the button below to get in contact with staff. Please provide any screenshots/evidence immediately upon opening!")

        await interaction.reply({ embeds: [embed], componenents: [button]});

        const collector = await interaction.channel.createMessageComponentCollector();


        // Currently 'parent' links to the reports category in magics, alter this later to make it dynamic;

        collector.on('collect', async holder => {

            await holder.update({ embeds:[embed], componenents: [button]})

            const channel = await interaction.guild.channels.create({
                name: `ticket ${holder.user.tag}`,
                type: ChannelType.GuildText,
                parent: '788488102770638868'
            })

            channel.permissionOverwrites.create(holder.user.id, {ViewChannel: true, SendMessages: true, AttachFiles: true});
            channel.permissionOverwrites.create(channel.guild.roles.everyone, {ViewChannel: false, SendMessages: false})

            channel.send({Content: `Welcome to the ticket, ${holder.user}. Please send any relevant documents/images as soon as you can.`})
            holder.user.send(`Your ticket, ${channel} has been opened.`);
            holder.user.send(``).catch(err => {return;})
        })
    }
}