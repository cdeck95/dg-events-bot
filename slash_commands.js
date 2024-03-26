const { SlashCommandBuilder } = require("@discordjs/builders");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
require("dotenv").config();

const today = new Date();

const commands = [
  new SlashCommandBuilder()
    .setName("create_event")
    .setDescription("Schedule a round of disc golf")
    .addStringOption((option) =>
      option
        .setName("location")
        .setDescription(
          "The location of the event (e.g., Tranquility Trails, 1234 Main St, etc.)"
        )
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription("The date of the event (e.g., YYYY-MM-DD)")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("The time of the event (e.g., 7:00 PM)")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("The title of the event (optional)")
        .setRequired(false)
    )
    .addUserOption((option) =>
      option
        .setName("organizer")
        .setDescription("Whoever is organizing the event (optional)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("delete_event")
    .setDescription("Delete a disc golf event")
    .addStringOption((option) =>
      option
        .setName("event_id")
        .setDescription("The ID of the event to delete")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("events_today")
    .setDescription("List all disc golf events happening today"),
  new SlashCommandBuilder()
    .setName("future_events")
    .setDescription("List all upcoming disc golf events"),
].map((command) => command.toJSON());

const rest = new REST({ version: "9" }).setToken(process.env.DISCORD_TOKEN);

rest
  .put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands })
  .then(() =>
    console.log("Successfully registered global application commands.")
  )
  .catch(console.error);

// Add the autocomplete logic for the create_event command
const { format, addDays } = require("date-fns");

module.exports = {
  async autocomplete(interaction) {
    if (!interaction.commandName === "create_event") return;

    const userQuery = interaction.options.getFocused();

    // Define the next 7 days from today
    const nextSevenDays = Array.from({ length: 7 }, (_, i) =>
      addDays(today, i)
    );

    // Format dates in YYYY-MM-DD
    const dateOptions = [
      ...nextSevenDays.map((date) => format(date, "yyyy-MM-dd")),
    ];

    // Filter date options based on the user's input prefix
    const filteredDateOptions = dateOptions.filter((date) =>
      date.startsWith(userQuery)
    );

    await interaction.respond(
      filteredDateOptions.map((date) => ({ name: date, value: date }))
    );
  },
};
