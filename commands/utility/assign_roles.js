const { ComponentType, Collection,
    SlashCommandBuilder, ActionRowBuilder,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder,
    ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ModalBuilder } = require('discord.js');
const { request } = require('undici');

// Manual role assignment option selected
async function manualRoleAssignment(initialInteraction) {
	const finalSelections = new Collection();
	const selectionsMade = [false, false];

	// Build component
	const userSelectMenu = new UserSelectMenuBuilder()
		.setCustomId('select_target_users')
		.setPlaceholder('Select target users (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const roleSelectMenu = new RoleSelectMenuBuilder()
		.setCustomId('select_roles_manual')
		.setPlaceholder('Select roles (Max 25)')
		.setMinValues(1)
		.setMaxValues(25);

	const confirmButton = new ButtonBuilder()
		.setCustomId('confirm_manual_role_assign')
		.setLabel('Confirm')
		.setStyle(ButtonStyle.Success);

	const userSelectMenuRow = new ActionRowBuilder().addComponents(userSelectMenu);
	const roleSelectMenuRow = new ActionRowBuilder().addComponents(roleSelectMenu);
	const confirmButtonRow = new ActionRowBuilder().addComponents(confirmButton);

	// Display component
	const response = await initialInteraction.update({
		content: 'Manual role assignment',
		components: [userSelectMenuRow, roleSelectMenuRow, confirmButtonRow],
	});

	const manualCollectorFilter = i => i.user.id === initialInteraction.user.id;

	const userCollector = response.createMessageComponentCollector({ filter: manualCollectorFilter, componentType: ComponentType.UserSelect, time: 1_200_000 });
	const roleCollector = response.createMessageComponentCollector({ filter: manualCollectorFilter, componentType: ComponentType.RoleSelect, time: 1_200_000 });
	const buttonCollector = response.createMessageComponentCollector({ filter: manualCollectorFilter, componentType: ComponentType.Button, time: 1_200_000 });

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

async function automaticRoleAssignment(initialInteraction) {
    const modal = new ModalBuilder()
        .setCustomId('submit_sheet_id')
        .setTitle('Enter Spreadsheet ID')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('sheet_id_input')
                    .setLabel('Spreadsheet ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Paste Sheet ID here')
                    .setRequired(true),
            ),
        );

    await initialInteraction.showModal(modal);

    const modalSubmit = await initialInteraction.awaitModalSubmit({ time: 120_000 });
    const spreadsheetID = modalSubmit.fields.getTextInputValue('sheet_id_input');

    await modalSubmit.deferReply();

    const apiResult = await request_sheet(spreadsheetID);
    const spreadsheet = await apiResult.body.json();
    const data = spreadsheet.sheets[0].data[0].rowData;

    let errorLog = '';

    for (let entry = 1; entry < data.length; entry++) {
        const discUsername = data[entry].values[0]?.userEnteredValue?.stringValue;
        const roleName = data[entry].values[1]?.userEnteredValue?.stringValue;

        if (!discUsername || !roleName) {
            errorLog += `Row ${entry + 1}: Missing username or role.\n`;
            continue;
        }

        const guild = modalSubmit.guild;

        const foundMembers = await guild.members.search({ query: discUsername, limit: 1 });
        if (foundMembers.size !== 1) {
            errorLog += `Row ${entry + 1}: User '${discUsername}' not found.\n`;
            continue;
        }
        const member = foundMembers.at(0);

        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            errorLog += `Row ${entry + 1}: Role '${roleName}' not found.\n`;
            continue;
        }

        await member.roles.add(role);
    }

    await modalSubmit.editReply('Roles assigned based on spreadsheet!');

    if (errorLog) {
        await modalSubmit.followUp({ content: `Some issues occurred:\n${errorLog}`, ephemeral: true });
    }
}

async function request_sheet(spreadsheetID) {
	const params = new Collection();
	const apiKey = ['X-Goog-Api-Key', 'AIzaSyDFaGMluXLS7zm8DwkbakLN0K8H6NeSYZg'];

	params.set('spreadsheetID', spreadsheetID);
	params.set('includeGridData', 'true');
	params.set('ranges', 'A:C');

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

		collector.on('collect', async selectInteraction => {
            if (selectInteraction.values[0] === 'manual') {
                await manualRoleAssignment(selectInteraction);
            } else {
                await automaticRoleAssignment(selectInteraction);
            }
        });
	},
};