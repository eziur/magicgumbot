const { ComponentType, Collection,
	SlashCommandBuilder, ModalBuilder, ActionRowBuilder,
	StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder,
	ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ModalSubmitInteraction } = require('discord.js');
const { request, Dispatcher } = require('undici');

// Manual role assignment option selected
async function manualRoleAssignment(initialInteraction) {
	const finalSelections = new Collection();
	const selectionsMade = [false, false];

	// Build component
	const userSelect = new UserSelectMenuBuilder()
		.setCustomId('select_target_users')
		.setPlaceholder('Select target users (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId('select_roles_manual')
		.setPlaceholder('Select roles (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const confirm = new ButtonBuilder()
		.setCustomId('confirm_manual_role_assign')
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success);

	const row1 = new ActionRowBuilder().addComponents(userSelect);
	const row2 = new ActionRowBuilder().addComponents(roleSelect);
	const row3 = new ActionRowBuilder().addComponents(confirm);

	// Display component
	const response = await initialInteraction.update({
		content: 'Manual role assignment',
		components: [row1, row2, row3],
	});

	const collectorFilter = i => i.user.id === initialInteraction.user.id;

	const userCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.UserSelect, time: 1_200_000 });
	const roleCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.RoleSelect, time: 1_200_000 });
	const buttonCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.Button, time: 1_200_000 });

	// User select menu
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

	// Role select menu
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

	// Confirm button
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

async function automaticRoleAssignment(interaction) {
	const finalCollection = new Collection();

	// Build modal components
	const requestInput = new TextInputBuilder()
		.setCustomId('api_request_input')
		.setLabel("Enter Sheet ID")
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('docs.google.com/spreadsheets/d/ID/edit')
		.setValue('1cX3nPtL3GApqV6Jp3UNDIDbrZ1VhBYUFKe0gGk3rHTI')
		.setRequired(true);

	const automaticRoleAssignmentModal = new ModalBuilder()
		.setCustomId('automatic_role_assignment_modal')
		.setTitle('Automatic Role Assignment');

	const requestInputRow = new ActionRowBuilder().addComponents(requestInput);

	automaticRoleAssignmentModal.addComponents(requestInputRow);

	// display modal
	await interaction.showModal(automaticRoleAssignmentModal);

	// listen for modal submission
	const filter = (modalInteraction) => modalInteraction.customId === 'automatic_role_assignment_modal';

	const modalSubmit = await interaction.awaitModalSubmit({ filter, time: 600_000 })
	.catch(modalSubmitError => {
		console.error(modalSubmitError);
	});

	// get submitted value
	const spreadsheetID = modalSubmit.fields.getTextInputValue('api_request_input');
	await modalSubmit.deferUpdate();

	// request sheet from api and interpret data
	const apiResult = await request_sheet(spreadsheetID);
	const spreadsheet = await apiResult.body.json();
	const data = spreadsheet.sheets[0].data[0].rowData;

	const memberList = [];
	for (let entry = 1; entry < data.length; entry++) {
		const discUsername = data[entry].values[1].userEnteredValue.stringValue;
		memberList.push(discUsername);
	}

	const memberObjectArray = await fetch_members(modalSubmit, memberList);

	// build role selection menu
	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId('select_roles_automatic')
		.setPlaceholder('Select roles (Max 25). The selected roles will be assigned to each user in the sheet')
		.setMinValues(1)
		.setMaxValues(25);

	const preview = new ButtonBuilder()
		.setCustomId('preview_user_list')
		.setLabel('Preview User List')
		.setStyle(ButtonStyle.Primary);

	const preview_disabled = new ButtonBuilder()
		.setCustomId('preview_user_list_disabled')
		.setLabel('Preview User List')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(true);

	const confirm = new ButtonBuilder()
		.setCustomId('confirm_automatic_role_assign')
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success);

	const cancel = new ButtonBuilder()
		.setCustomId('cancel_role_select_automatic')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Danger);

	const row1 = new ActionRowBuilder().addComponents(roleSelect);
	const row2 = new ActionRowBuilder().addComponents(preview);
	const row2_disabled = new ActionRowBuilder().addComponents(preview_disabled);
	const row3 = new ActionRowBuilder().addComponents(confirm, cancel);

	const response = await modalSubmit.editReply({
		content: 'Automatic Role Assignment',
		components: [row1, row2, row3],
	});

	const collectorFilter = i => i.user.id === modalSubmit.user.id;

	// listen for response
	const roleCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.RoleSelect, time: 1_200_000 });
	const buttonCollector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.Button, time: 1_200_000 });

	let roleSelected = false;

	roleCollector.on('collect', async roleInput => {
		await roleInput.deferUpdate();

		if (roleCollector.collected.at(0).replied) {
			roleCollector.collected.at(0).deleteReply();
			roleCollector.collected.delete(roleCollector.collected.firstKey());
		}

		if (roleInput.values.length > 0) roleSelected = true;
		else roleSelected = false;
	});

	buttonCollector.on('collect', async buttonInteraction => {
		if (buttonInteraction.component.customId === 'cancel_role_select_automatic') {
			const automatic_role_select_cancel = await buttonInteraction.reply("Interaction cancelled");
			setTimeout(() => automatic_role_select_cancel.delete(), 10_000);
			await modalSubmit.editReply({ components: [] });
		}

		else if (buttonInteraction.component.customId === 'preview_user_list') {
			if (!roleSelected) {
				await buttonInteraction.reply({
					content: 'Select at least 1 role.',
					ephemeral: true,
				});
				setTimeout(() => buttonInteraction.deleteReply(), 10_000);
			}
			else {
				await modalSubmit.editReply({ components: [row1, row2_disabled, row3] });

				const numUsers = memberObjectArray.length;
				let userList = `${numUsers} users were retrieved from the spreadsheet: \n`;
				for (let i = 0; i < numUsers; i++) {
					userList += `${memberObjectArray[i].user.tag} \n`;
				}

				await buttonInteraction.reply({
					content: userList,
					ephemeral: true,
				});
				setTimeout(() => buttonInteraction.deleteReply(), 100_000);
			}
		}

		else if (buttonInteraction.component.customId === 'confirm_automatic_role_assign') {
			if (!roleSelected) {
				await buttonInteraction.reply({
					content: 'Select at least 1 role.',
					ephemeral: true,
				});
				setTimeout(() => buttonInteraction.deleteReply(), 10_000);
			}
			else {
				await buttonInteraction.deferReply();

				for (let i = 0; i < memberObjectArray.length; i++) {
					const rolesToAssign = [];

					roleCollector.collected.at(0).roles.each(role => {
						rolesToAssign.push(role.id);
					});

					finalCollection.set(memberObjectArray[i].id, rolesToAssign);
				}

				assign_roles(buttonInteraction, finalCollection);
				modalSubmit.deleteReply();
			}
		}
	});
}

async function request_sheet(spreadsheetID) {
	const params = new Collection();
	const apiKey = ['X-Goog-Api-Key', 'AIzaSyDFaGMluXLS7zm8DwkbakLN0K8H6NeSYZg'];

	params.set('spreadsheetID', spreadsheetID);
	params.set('includeGridData', 'true');
	params.set('ranges', 'C:D');

	const query = `https://sheets.googleapis.com/v4/
		spreadsheets/${params.get('spreadsheetID')}/?
		includeGridData=${params.get('includeGridData')}&
		ranges=${params.get('ranges')}`;

	const apiResult = await request(query, {
		headers: apiKey,
	});

	return apiResult;
}

async function fetch_members(interaction, memberList) {
	const guild = interaction.guild;
	const memberObjectArray = [];

	for (let entry = 0; entry < memberList.length; entry++) {
		const queryMembers = await guild.members.search({ query: memberList[entry] });

		if (queryMembers.size === 1) {
			const member = await guild.members.fetch(queryMembers.at(0));
			memberObjectArray.push(member);
		}
		else {
			// multiple users returned from query
		}
	}
	return memberObjectArray;
}

async function assign_roles(interaction, collection) {
	const guild = interaction.guild;
	const iterator = collection[Symbol.iterator]();

	let confirmationMessage = ``;

	for (const item of iterator) {
		const member = guild.members.cache.get(item[0]);
		confirmationMessage += `Assigned `;

		for (const roles of item[1]) {
			const role = await guild.roles.cache.get(roles);

			await member.roles.add(role);
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

		const collectorFilter = i => i.user.id === interaction.user.id;

		const collector = response.createMessageComponentCollector({ filter: collectorFilter, componentType: ComponentType.StringSelect, time: 3_600_000 });

		collector.on('collect', async i => {
			const selection = i.values[0];

			if (selection === 'manual') {
				manualRoleAssignment(i);
			}
			else if (selection === 'automatic') {
				automaticRoleAssignment(i);
			}
		});
	},
};