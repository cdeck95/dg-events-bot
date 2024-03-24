require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const { parse, format } = require("date-fns");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

const guildID = "1078672740862672936"; // my server
//const guildID = "1086345260994658425"; // disc guild server

// Update the Event class to match the structure of scheduled events from Discord API
// Update the Event class to match the structure of scheduled events from Discord API
class Event {
  constructor(eventData) {
    this.eventId = eventData.id;
    this.guildID = eventData.guild_id;
    this.channelId = eventData.channel_id;
    this.creatorId = eventData.creator_id;
    this.name = eventData.name;
    this.description = eventData.description || null;
    this.startTime = new Date(eventData.scheduled_start_time);
    this.endTime = eventData.scheduled_end_time
      ? new Date(eventData.scheduled_end_time)
      : null;
    this.privacyLevel = eventData.privacy_level;
    this.status = eventData.status;
    this.entityType = eventData.entity_type;
    this.entityId = eventData.entity_id || null;
    this.entityMetadata = eventData.entity_metadata || null;
    this.creator = eventData.creator || null;
    this.userCount = eventData.user_count || null;
    this.image = eventData.image || null;
  }
}

const axios = require("axios");

async function loadEventsFromAPI(guildID) {
  try {
    console.log("Loading events from Discord API");
    const guild = await client.guilds.fetch(guildID);
    console.log("Guild fetched:", guild);
    const events = await guild.scheduledEvents.fetch();
    console.log("Events fetched:", events);

    // Process the events here

    console.log("Events loaded successfully from Discord API:", events);
    return events;
  } catch (error) {
    console.error("Error loading events from Discord API:", error);
    throw error;
  }
}

// Call the function to load events from the Discord API
async function loadEvents() {
  try {
    const eventData = await loadEventsFromAPI(guildID);
    // Process the eventData as needed
    // For now, let's just log it out
    console.log("Events loaded successfully:", eventData);
    return eventData; // Return the loaded events
  } catch (error) {
    console.error("Error loading events:", error);
    return null;
  }
}

client.once("ready", () => {
  console.log("Bot is ready!");

  const events = loadEvents();

  // Log out all events in the server
  console.log("Events in the server:");
  Object.values(events).forEach((event) => {
    console.log(event);
    console.log("----------------------");
  });
});

// Function to create an event using the Discord API
async function createEventInAPI(
  guildID,
  location,
  startTime,
  endTime,
  title = "",
  description = ""
) {
  try {
    const response = await axios.post(
      `https://discord.com/api/guilds/${guildID}/scheduled-events`,
      {
        channel_id: null, // Replace null with the channel ID where you want to create the event
        entity_metadata: { location: location },
        name: title || `Round @ ${location}`, // Default title if not provided
        privacy_level: 2, // Guild Only
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString(),
        description: description,
      }
    );
    const eventData = response.data;
    // Process the eventData as needed
    console.log("Event created in Discord API:", eventData);
    return eventData;
  } catch (error) {
    console.error("Error creating event in Discord API:", error);
    return null;
  }
}

// Function to send an embed message for event creation
async function sendEventCreationEmbed(interaction, eventData) {
  try {
    const embed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Event Created")
      .setDescription("Your event has been successfully created!")
      .addFields(
        { name: "Location", value: eventData.entity_metadata.location },
        {
          name: "Start Time",
          value: new Date(eventData.scheduled_start_time).toLocaleString(),
        },
        {
          name: "End Time",
          value: new Date(eventData.scheduled_end_time).toLocaleString(),
        }
      );

    if (eventData.name) {
      embed.addField("Title", eventData.name);
    }

    if (eventData.description) {
      embed.addField("Description", eventData.description);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error sending event creation embed:", error);
    await interaction.editReply("There was an error while creating the event.");
  }
}

// Function to handle the "Create Event" command
async function handleCreateEventCommand(interaction) {
  try {
    const guildID = interaction.guildID;
    const location = interaction.options.getString("location");
    const dateInput = interaction.options.getString("date");
    const timeInput = interaction.options.getString("time");

    // Combine date and time inputs into a standard ISO 8601 string
    const combinedDateTimeString = `${dateInput}T${timeInput}`;
    const startTime = new Date(combinedDateTimeString);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // Add 2 hours to start time for end time

    // Default title to "Round @ [Location]" if not provided
    const title = interaction.options.getString("title") || "";

    const description = interaction.options.getString("description") || "";

    // Call function to create event using Discord API
    const eventData = await createEventInAPI(
      guildID,
      location,
      startTime,
      endTime,
      title,
      description
    );

    if (eventData) {
      await sendEventCreationEmbed(interaction, eventData);
    } else {
      await interaction.editReply(
        "Failed to create event. Please try again later."
      );
    }
  } catch (error) {
    console.error("Error handling create event command:", error);
    await interaction.editReply("There was an error while creating the event.");
  }
}

async function fetchUserDisplayNames(guild, userIds) {
  // Wrap the userIds in an array if it's not already one
  const userIdArray = Array.isArray(userIds) ? userIds : [userIds];

  const displayNames = [];
  for (const userId of userIdArray) {
    const member = await guild.members.fetch(userId);
    displayNames.push(member.displayName);
  }
  return displayNames;
}

// Function to create an embed for each event
async function createEventEmbed(event, guild) {
  const goingDisplayNames = await fetchUserDisplayNames(guild, event.going);
  const interestedDisplayNames = await fetchUserDisplayNames(
    guild,
    event.maybe
  );

  console.log("description", event.description);

  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle(`Event: ${event.name}`)
    .setDescription(event.description || "No description provided")
    .addFields(
      { name: "Location", value: event.entityMetadata.location },
      {
        name: "Start Time",
        value: new Date(event.scheduledStartTimestamp).toLocaleString(),
      },
      {
        name: "End Time",
        value: new Date(event.scheduledEndTimestamp).toLocaleString(),
      },
      { name: "Creator", value: event.creator.username },
      { name: "Going", value: goingDisplayNames.join("\n") || "None" },
      { name: "Interested", value: interestedDisplayNames.join("\n") || "None" }
    )
    .setTimestamp();

  return embed;
}

client.on("interactionCreate", async (interaction) => {
  try {
    await interaction.deferReply(); // Defer the reply to indicate that the bot is processing the command

    if (interaction.isCommand()) {
      const commandName = interaction.commandName;
      const guild = interaction.guild;

      console.log("Command Name:", commandName);

      if (commandName === "create_event") {
        await handleCreateEventCommand(interaction);
      }
      if (commandName === "events_today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // set the time to 00:00:00

        const eventsToday = await loadEvents();

        // const eventsToday = (await loadEvents()).filter((event) => {
        //   const eventDate = new Date(event.date);
        //   eventDate.setHours(0, 0, 0, 0); // set the time to 00:00:00
        //   return eventDate.getTime() === today.getTime();
        // });
        console.log("Events today loaded:", eventsToday);
        console.log("Events today count:", eventsToday.size);

        if (eventsToday.size > 0) {
          for (const event of eventsToday.values()) {
            const embed = await createEventEmbed(event, guild);
            await interaction.editReply({ embeds: [embed] });
          }
        } else {
          await interaction.editReply("No events are happening today.");
        }
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    await interaction.editReply(
      "There was an error while processing your command."
    );
  }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN);
