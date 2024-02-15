const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder, Collection } = require('discord.js');

async function manualRoleAssignment(initialInteraction) {
	const selectionsMade = [false, false];

	const userSelect = new UserSelectMenuBuilder()
		.setCustomId('select_target_users')
		.setPlaceholder('Select target users (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId('select_roles')
		.setPlaceholder('Select roles (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const confirm = new ButtonBuilder()
		.setCustomId('confirm_manual_role_assign')
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success);

	const userSelectRow = new ActionRowBuilder()
		.addComponents(userSelect);

	const roleSelectRow = new ActionRowBuilder()
		.addComponents(roleSelect);

	const buttonRow = new ActionRowBuilder()
		.addComponents(confirm);

	const response = await initialInteraction.update({
		content: 'Manual role assignment',
		components: [userSelectRow, roleSelectRow, buttonRow],
	});

	const collectorFilter = i => i.user.id === initialInteraction.user.id;

	const userCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.UserSelect, time: 1_200_000 });
	const roleCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.RoleSelect, time: 1_200_000 });
	const buttonCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.Button, time: 1_200_000 });

	userCollector.on('collect', async userInput => {
		await userInput.deferReply({ ephemeral: true });

		if (userCollector.collected.at(0).replied) {
			userCollector.collected.at(0).deleteReply();
			userCollector.collected.delete(userCollector.collected.firstKey());
		}

		let currentlySelectedUsers = `Currently Selected Users: `;
		userInput.users.each(key => currentlySelectedUsers += `${key}, `);

		if (userInput.values.length > 0) selectionsMade[0] = true;
		else selectionsMade[0] = false;

		await userInput.editReply(currentlySelectedUsers);
	});

	roleCollector.on('collect', async roleInput => {
		await roleInput.deferReply({ ephemeral: true });

		if (roleCollector.collected.at(0).replied) {
			roleCollector.collected.at(0).deleteReply();
			roleCollector.collected.delete(roleCollector.collected.firstKey());
		}

		let currentlySelectedRoles = `Currently Selected Roles: `;
		roleInput.roles.each(key => currentlySelectedRoles += `${key}, `);

		if (roleInput.values.length > 0) selectionsMade[1] = true;
		else selectionsMade[1] = false;

		await roleInput.editReply(currentlySelectedRoles);
	});

	buttonCollector.on('collect', async confirmButton => {
		if (!selectionsMade[0] || !selectionsMade[1]) {
			await confirmButton.reply({
				content: 'Select at least 1 user and 1 role.',
				ephemeral: true,
			});
		}
		else {
			await confirmButton.deferReply();

			const userCollection = userCollector.collected.at(0).values;
			const roleCollection = roleCollector.collected.at(0).values;
			userCollector.collected.at(0).deleteReply();
			roleCollector.collected.at(0).deleteReply();
			userCollector.stop();
			roleCollector.stop();

			const finalSelections = new Collection();
			for (let i = 0; i < userCollection.length; i++) {
				const rolesToAssign = [];

				for (let j = 0; j < roleCollection.length; j++) {
					rolesToAssign.push(roleCollection[j]);
				}
				finalSelections.set(userCollection[i], rolesToAssign);
			}

			assign_roles(confirmButton, finalSelections);
		}
	});
}

async function assign_roles(interaction, collection) {
	const guild = interaction.guild;
	const iterator = collection[Symbol.iterator]();

	let confirmationMessage = ``;

	for (const item of iterator) {
		const member = guild.members.cache.get(item[0]);
		confirmationMessage += `Assigned `;

		for (const roles of item[1]) {
			const role = guild.roles.cache.get(roles);

			member.roles.add(role);
			confirmationMessage += `${role} `;
		}

		confirmationMessage += `to <@${item[0]}>. \n`;
		await interaction.editReply(confirmationMessage);
	}
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