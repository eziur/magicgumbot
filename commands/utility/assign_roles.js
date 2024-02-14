const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder, userMention, roleMention } = require('discord.js');

async function manualRoleAssignment(i) {
	const userSelect = new UserSelectMenuBuilder()
		.setCustomId('select_target_users')
		.setPlaceholder('Select target users (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId('select_roles')
		.setPlaceholder('Select roles (Max 5)')
		.setMinValues(1)
		.setMaxValues(5);

	const confirm = new ButtonBuilder()
		.setCustomId('confirm_manual_role_assign')
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success)
		.setDisabled(true);

	const userSelectRow = new ActionRowBuilder()
		.addComponents(userSelect);
	const roleSelectRow = new ActionRowBuilder()
		.addComponents(roleSelect);
	const buttonRow = new ActionRowBuilder()
		.addComponents(confirm);

	const response = await i.update({
		content: 'Manual role assignment',
		components: [userSelectRow, roleSelectRow, buttonRow],
	});

	const userCollector = response.createMessageComponentCollector({ componentType: ComponentType.UserSelect, time: 1_200_000 });
	userCollector.on('collect', async userInput => {
		await userInput.deferReply({ ephemeral: true });

		if (userCollector.collected.at(0).replied) {
			userCollector.collected.at(0).deleteReply();
			userCollector.collected.delete(userCollector.collected.firstKey());
		}

		let currentlySelectedUsers = `Currently Selected Users: `;
		for (let j = 0; j < userInput.values.length; j++) {
			currentlySelectedUsers += `${userMention(userInput.values[j])}, `;
		}

		await userInput.editReply(currentlySelectedUsers);
	});

	const roleCollector = response.createMessageComponentCollector({ componentType: ComponentType.RoleSelect, time: 1_200_000 });
	roleCollector.on('collect', async roleInput => {
		await roleInput.deferReply({ ephemeral: true });

		// if (roleCollector.collected.at(0).replied) {
		// 	roleCollector.collected.at(0).deleteReply();
		// 	roleCollector.collected.delete(roleCollector.collected.firstKey());
		// }

		let currentlySelectedRoles = `Currently Selected Roles: `;
		for (let j = 0; j < roleInput.values.length; j++) {
			currentlySelectedRoles += `${roleMention(roleInput.values[j].id.toString())}, `;
		}

		await roleInput.editReply(currentlySelectedRoles);
	});
	// const buttonCollector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3_600_000 });

	// });
}

module.exports = {
	category: 'utility',
	data: new SlashCommandBuilder()
		.setName('assign_roles')
		.setDescription('Assigns roles for MagicGum event'),

	async execute(interaction) {
		const modeSelect = new StringSelectMenuBuilder()
			.setCustomId('select_mode')
			.setPlaceholder('select')
			.addOptions(
				new StringSelectMenuOptionBuilder()
					.setLabel('Manual')
					.setDescription('Manual entry of user/role')
					.setValue('manual'),
				new StringSelectMenuOptionBuilder()
					.setLabel('Automatic')
					.setDescription('Automated input of user/role')
					.setValue('automatic'),
			);

		const modeSelectRow = new ActionRowBuilder()
			.addComponents(modeSelect);

		const response = await interaction.reply({
			content: 'Select role assignment mode',
			components: [modeSelectRow],
		});

		const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 3_600_000 });

		collector.on('collect', async i => {
			const selection = i.values[0];

			if (selection === 'manual') {
				manualRoleAssignment(i);
			}
		});
			// if (response.isStringSelectMenu()) {
			// 	if (response.customId === 'select_mode') {
			// 		const mode = interaction.values[0];

			// 		await interaction.editReply({
			// 			content: 'Manual mode',
			// 			components: [],
			// 		});
			// 	}
			// }
			// else if (response.isButton()) {
			// 	if (response.customId === 'cancel') {
			// 		await interaction.update({
			// 			content: 'Mode selection canceled.',
			// 			components: [],
			// 		});
			// 	}
	},
};