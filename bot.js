require("dotenv").config();
const cron = require("node-cron");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");
const {
  addDays,
  addMinutes,
  format,
  parse,
  isValid,
  isAfter,
  setHours,
  setMinutes,
  padStart,
} = require("date-fns");
const fs = require("fs");
const path = require("path");
const { ca } = require("date-fns/locale");

// Define the path to your JSON file
const eventsFilePath = path.join(__dirname, "events.json");
const guildID = "1078672740862672936"; // my server
//const guildID = "1086345260994658425"; // disc guild server

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

class Event {
  constructor(
    eventId,
    location,
    dateTime,
    organizerId,
    guildId,
    type,
    title,
    description,
    going = [],
    maybe = []
  ) {
    this.eventId = eventId;
    this.location = location;
    this.dateTime = new Date(dateTime);
    this.organizerId = organizerId; // Now storing ID
    this.guildId = guildId;
    this.type = type;
    this.title = title;
    this.description = description;
    this.going = going;
    this.maybe = maybe;
  }

  // Update a user's status to "going"
  updateGoing(user) {
    // Check if the user is already marked as going
    if (this.going.includes(user)) {
      // Remove the user from the going list
      this.going = this.going.filter((u) => u !== user);
      console.log("User removed from going list");
      // Save the updated events after changing attendance
      saveEvents();
      return "removed";
    } else {
      // Remove the user from both lists, if present
      this.maybe = this.maybe.filter((u) => u !== user);
      // Add the user to the "going" list
      this.going.push(user);
      console.log("User added to going list");
      // Save the updated events after changing attendance
      saveEvents();
      return "added";
    }
  }

  // Update a user's status to "maybe"
  updateMaybe(user) {
    // Check if the user is already marked as maybe
    if (this.maybe.includes(user)) {
      // Remove the user from the maybe list
      this.maybe = this.maybe.filter((u) => u !== user);
      // Save the updated events after changing attendance
      saveEvents();
      return "removed";
    } else {
      // Remove the user from both lists, if present
      this.going = this.going.filter((u) => u !== user);
      // Add the user to the "maybe" list
      this.maybe.push(user);
      // Save the updated events after changing attendance
      saveEvents();
      return "added";
    }
  }
}

let events = {};
let allEvents = {};

const CHANNEL_TO_REPLY = process.env.CHANNEL_TO_REPLY;

async function loadEventsFromAPI(guildID) {
  try {
    //console.log("Loading events from Discord API");
    const guild = await client.guilds.fetch(guildID);
    //console.log("Guild fetched:", guild);
    const events = await guild.scheduledEvents.fetch();

    // Process the events here

    //console.log("Events loaded successfully from Discord API:", events);
    return events;
  } catch (error) {
    console.error("Error loading events from Discord API:", error);
    throw error;
  }
}

// Function to load events from JSON file
function loadEvents() {
  try {
    if (fs.existsSync(eventsFilePath)) {
      const rawData = fs.readFileSync(eventsFilePath);
      const loadedEvents = JSON.parse(rawData);

      // Clear existing events in memory to avoid duplicates
      events = {};

      Object.keys(loadedEvents).forEach((eventId) => {
        const e = loadedEvents[eventId];
        // console.log("Loading event:", e);
        // Reconstruct each Event object, including its going and maybe lists
        events[eventId] = new Event(
          e.eventId,
          e.location,
          e.dateTime,
          e.organizerId,
          e.guildId,
          e.type,
          e.title,
          e.description,
          e.going,
          e.maybe
        );
      });
      //console.log("Events loaded successfully.", events);
      return events;
    }
  } catch (error) {
    console.error("Error loading events:", error);
  }
}

// Function to save events to JSON file
function saveEvents() {
  try {
    const data = JSON.stringify(events, null, 2); // Pretty print the JSON
    fs.writeFileSync(eventsFilePath, data);
    console.log("Events saved successfully.");
  } catch (error) {
    console.error("Error saving events:", error);
  }
}

function normalizeDiscordEvent(discordEvent, guildId) {
  return new Event(
    discordEvent.id, // eventId
    discordEvent.entityMetadata["location"] || "Online/Discord", // location, adjusted as needed
    discordEvent.scheduledStartTimestamp, // dateTime, assuming this is a timestamp
    discordEvent.creatorId || guildId, // organizerId, fallback to guildId
    guildId, // guildId, as passed to the function
    "discord",
    discordEvent.name || "", // title, fallback to ""
    discordEvent.description || "" // description, fallback to ""
    // Excluding 'going' and 'maybe' as they are not applicable
  );
}

async function getAllEvents(guildID) {
  try {
    const discordEventsRaw = await loadEventsFromAPI(guildID);
    //console.log("Discord events loaded:", discordEventsRaw);
    const customEventsRaw = await loadEvents(); // Assumes this returns the custom events

    // Normalize Discord events
    const discordEvents = [...discordEventsRaw.values()].map((event) =>
      normalizeDiscordEvent(event, guildID)
    );
    //console.log("Normalized Discord events:", discordEvents);

    // Assuming customEventsRaw is already in the desired format
    const customEvents = Object.values(customEventsRaw);

    // Combine the events
    const allEvents = discordEvents.concat(customEvents);
    //console.log("All events combined:", allEvents);

    // Now `allEvents` contains both your custom events and normalized Discord events
    return allEvents;
  } catch (error) {
    console.error("Error loading all events:", error);
    throw error;
  }
}

// Function to fetch a user's display name and return formatted string for embed
async function fetchUserDetailsForEmbed(userId, guild) {
  try {
    const member = await guild.members.fetch(userId);
    //console.log("Fetched member:", member.displayName);
    const displayName = member.displayName;
    //console.log("Fetched display name:", member.displayAvatarURL());
    const avatarUrl = member.displayAvatarURL();
    //console.log("Fetched avatar URL:", avatarUrl);
    return {
      displayName: member.displayName,
      avatarUrl: member.user.avatarURL(),
    };
  } catch (error) {
    console.error("Failed to fetch user details:", error);
    return "User not found"; // Fallback text
  }
}

async function createEventEmbed(event, guild, eventId) {
  const formatUserListForEmbed = async (userIds) => {
    const userDetailObjects = await Promise.all(
      userIds.map(async (userId) => {
        const member = await guild.members.fetch(userId);
        return member.displayName;
      })
    );
    return userDetailObjects.join("\n") || "No one yet";
  };

  const organizerDisplayName = await fetchUserDetailsForEmbed(
    event.organizerId,
    guild
  );

  let embedDescription = `**Where:** ${
    event.location
  }\n**When:** ${event.dateTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })} @ ${event.dateTime.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;

  let embed = new EmbedBuilder()
    .setColor(event.type === "discord" ? "#008000" : "#0099ff")
    .setTitle(event.title || "Round @ " + event.location)
    .setDescription(embedDescription)
    .setFooter({ text: `Event ID: ${event.eventId}` });

  if (event.type !== "discord") {
    embed.setDescription(
      `${embedDescription}\n**Organizer**: ${organizerDisplayName}`
    );

    const goingList = await formatUserListForEmbed(event.going);
    const maybeList = await formatUserListForEmbed(event.maybe);

    embed.addFields(
      { name: `Going (${event.going.length})`, value: goingList, inline: true },
      { name: `Maybe (${event.maybe.length})`, value: maybeList, inline: true }
    );
  }

  // Initialize an empty array for components
  let components = [];
  let eventTitle = event.title || "Round @ " + event.location;

  if (event.type !== "discord") {
    const goingButton = new ButtonBuilder()
      .setCustomId(`going_${eventId}`)
      .setLabel(`🎉 Going to Event: ${eventId}`)
      .setStyle(ButtonStyle.Success);
    const maybeButton = new ButtonBuilder()
      .setCustomId(`maybe_${eventId}`)
      .setLabel(`🤷 Maybe for Event: ${eventId}`)
      .setStyle(ButtonStyle.Primary);

    components = new ActionRowBuilder().addComponents(goingButton, maybeButton);
  }

  return { embed, components: components };
}

async function fetchUserDetailsForEmbed(userId, guild) {
  const member = await guild.members.fetch(userId);
  return member.displayName; // Add more details here if needed
}

function parseTimeTo24Hour(timeInput) {
  // Matches the time input with groups for hour, minute, and AM/PM part
  const match = timeInput.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);
  if (!match) return null; // Return null if time input is invalid

  let [, hour, minute = "00", meridiem] = match;
  hour = parseInt(hour, 10);
  minute = parseInt(minute, 10);

  if (meridiem) {
    meridiem = meridiem.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
  } else {
    // Handle 24-hour format without AM/PM
    if (hour > 23 || minute > 59) return null; // Invalid time
  }

  // Ensure hour and minute are two digits
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

client.once("ready", async () => {
  console.log("Ready!");
  console.log(`Logged in as ${client.user.tag}`);
  // Call the function to load events
  // loadEvents();
  allEvents = await getAllEvents(guildID);
  // console.log("All events in the server", allEvents);
});

client.on("interactionCreate", async (interaction) => {
  try {
    console.log("Interaction received:", interaction);
    if (
      interaction.channelId !== "1220735798312173588" &&
      interaction.channelId !== "1146900637209079941"
    ) {
      interaction.reply("Please use the bot in the <#meetup-bot> channel.");
      return;
    }
    if (interaction.isCommand()) {
      await interaction.deferReply(); // Defer the reply to indicate that the bot is processing the command
      const { commandName, guildId } = interaction;
      console.log("Guild ID:", guildId);

      if (commandName === "create_event") {
        const location = interaction.options.getString("location");

        console.log(interaction.options);

        const dateInput = interaction.options.getString("date"); // e.g., '2023-09-15'

        const dateParts = dateInput.split("/");
        const formattedDateInput = `${dateParts[2]}-${dateParts[0].padStart(
          2,
          "0"
        )}-${dateParts[1].padStart(2, "0")}`;

        const timeInput = interaction.options.getString("time"); // e.g., '7:00 PM'
        console.log("Time input:", timeInput);
        const timeInputFormatted = parseTimeTo24Hour(timeInput);
        console.log("Time input formatted:", timeInputFormatted);
        if (!timeInputFormatted) {
          await interaction.editReply({
            content:
              "The provided time couldn't be parsed. Please check the format and try again.",
            ephemeral: true,
          });
          return;
        }

        const combinedDateTimeString = `${formattedDateInput}T${timeInputFormatted}:00`;
        console.log("Combined Date Time String:", combinedDateTimeString);

        const eventDateTime = new Date(combinedDateTimeString);
        console.log("Event Date Time:", eventDateTime);

        if (!(eventDateTime instanceof Date && !isNaN(eventDateTime))) {
          await interaction.editReply({
            content:
              "The provided date or time couldn't be parsed. Please check the formats and try again.",
            ephemeral: true,
          });
          return;
        }

        // Check if the provided date is in the future
        const now = new Date();
        if (eventDateTime <= now) {
          await interaction.editReply({
            content:
              "The provided date and time must be in the future. Please provide a future date and time.",
            ephemeral: true,
          });
          return;
        }

        // Check if the title option is provided by the user
        let title;
        if (interaction.options.getString("title")) {
          title = interaction.options.getString("title");
        }

        const organizerId =
          interaction.options.getUser("organizer").id || interaction.user.id;

        const eventId = Object.keys(events).length + 1;
        events[eventId] = new Event(
          eventId,
          location,
          eventDateTime,
          organizerId,
          guildId,
          "custom",
          title
        );

        console.log(`Event added: ${eventId}`, events[eventId]); // Verify event addition
        console.log(events);

        const { embed, components } = await createEventEmbed(
          events[eventId],
          interaction.guild,
          eventId
        );
        console.log(embed);
        console.log(components);

        saveEvents(); // Save events after adding a new one

        await interaction.editReply({
          embeds: [embed],
          components: [components],
        });
      }

      if (commandName === "events_today") {
        // Start by replying with an initial message indicating that more info is coming
        await interaction.editReply({
          content: "Fetching today's events...",
          ephemeral: true,
        });
        const today = new Date();
        getAllEvents(guildId).then(async (allEvents) => {
          const eventsToday = allEvents.filter(
            (event) =>
              event.dateTime.toDateString() === today.toDateString() &&
              event.guildId === guildId
          );

          if (eventsToday.length > 0) {
            const embeds = [];
            const components = [];
            for (const event of eventsToday) {
              const { embed, components: eventComponents } =
                await createEventEmbed(event, interaction.guild, event.eventId);
              console.log("Embed created: ", embed);
              embeds.push(embed);
              if (eventComponents === null) {
                continue;
              } else {
                components.push(eventComponents);
              }
            }
            const moreThan10 = eventsToday.length > 10;
            // Send the initial reply or a follow-up for the first batch of embeds
            await interaction.editReply({
              content: moreThan10
                ? "Here are today's events (limit 10):"
                : "Here are today's events:", // Clear the initial fetching message
              embeds: embeds.slice(0, 10),
              components: components.slice(0, 10), // Adjust as per your component handling
            });
          } else {
            await interaction.editReply("No events are happening today.");
          }
        });
      }

      // Handling the future_events command
      if (commandName === "future_events") {
        // Start by replying with an initial message indicating that more info is coming
        await interaction.editReply({
          content: "Fetching future events...",
          ephemeral: true,
        });

        const today = new Date(); // Today's date
        const tomorrow = new Date(today); // Clone today's date to avoid mutating the original
        tomorrow.setDate(tomorrow.getDate() + 1); // Increment the day to get tomorrow
        tomorrow.setHours(0, 0, 0, 0); // Set time to the start of tomorrow

        getAllEvents(guildId).then(async (allEvents) => {
          const futureEvents = allEvents.filter(
            (event) =>
              new Date(event.dateTime) >= tomorrow && event.guildId === guildId
          );

          console.log("# of Future events:", futureEvents.length);
          console.log("Future events:", futureEvents);

          // Sort the events by their start dateTime
          futureEvents.sort(
            (a, b) => new Date(a.dateTime) - new Date(b.dateTime)
          );

          console.log("Sorted Future events:", futureEvents);

          if (futureEvents.length > 0) {
            const embeds = [];
            const components = [];
            for (const event of futureEvents) {
              const { embed, components: eventComponents } =
                await createEventEmbed(event, interaction.guild, event.eventId);
              embeds.push(embed);
              if (eventComponents === null) {
                continue;
              } else {
                components.push(eventComponents);
              }
            }
            // Send the initial reply or a follow-up for the first batch of embeds
            await interaction.editReply({
              content: "Here are the future events (limit 10):", // Clear the initial fetching message
              embeds: embeds.slice(0, 10),
              components: components.slice(0, 10), // Adjust as per your component handling
            });
          } else {
            await interaction.reply("No events are happening in the future.");
          }
        });
      }

      // Handling the delete_event command or button interaction
      if (commandName === "delete_event") {
        // Retrieve the event ID from the interaction options
        const eventId = interaction.options.getString("event_id");

        // Check if the event ID is valid and the event exists
        if (events[eventId]) {
          // Delete the event from the events object
          delete events[eventId];

          // Save the updated events to the JSON file
          saveEvents();

          // Send a confirmation message
          await interaction.editReply({
            content: `Event #${eventId} has been successfully deleted.`,
            ephemeral: true,
          });
        } else {
          // If the event ID is invalid or the event doesn't exist, send an error message
          await interaction.editReply({
            content: "Invalid event ID. Event not found.",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.isButton()) {
      const { customId, user } = interaction;
      const [action, eventId] = customId.split("_");

      if (events[eventId]) {
        const displayName = await interaction.guild.members
          .fetch(user.id)
          .then((member) => member.displayName);

        let responseMessage = ""; // Message to indicate the action result

        // Update the event's going or maybe list based on the action
        if (action === "going") {
          const response = events[eventId].updateGoing(user.id); // Save the user ID instead of username
          responseMessage =
            response === "added"
              ? `${displayName}, you are now marked as going to the event.`
              : `${displayName}, you are no longer marked as going to the event.`;
        } else if (action === "maybe") {
          const response = events[eventId].updateMaybe(user.id); // Save the user ID instead of username
          responseMessage =
            response === "added"
              ? `${displayName}, you are now marked as maybe for the event.`
              : `${displayName}, you are no longer marked as maybe for the event.`;
        }

        // Generate the updated embed for the event
        const { embed, components } = await createEventEmbed(
          events[eventId],
          interaction.guild,
          eventId
        );
        console.log("Updated embed:", embed);
        console.log("Updated components:", components);

        // Convert EmbedBuilder to a plain object
        const updatedEmbed = embed.toJSON();
        console.log("JSON Format:", updatedEmbed);

        // // Ensure components are structured correctly
        // const updatedComponents = components.components.map((component) =>
        //   component.toJSON()
        // );

        // console.log("Updated components (JSON):", updatedComponents);

        // Edit the original message to include the updated embed and components
        await interaction.update({
          embeds: [updatedEmbed], // Embeds expect an array of embed objects
          components: [components], // Components structured as an array of component objects
        });

        // Send an ephemeral follow-up message to the user
        await interaction.followUp({
          content: responseMessage,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "Event not found.",
          ephemeral: true,
        });
      }
    } else {
      try {
        // check if the interaction is a request for autocomplete
        if (interaction.isAutocomplete()) {
          const focusedOption = interaction.options.getFocused(true)["name"];
          const focusedValue = interaction.options.getFocused();
          // console.log(`focused option: ${focusedOption}`);
          // console.log(`focused value: ${focusedValue}`);
          // console.log(interaction.options);

          if (focusedOption === "date") {
            //console.log("focused value is date");
            const todayDate = format(new Date(), "MM/dd/yyyy");
            const nextSevenDays = Array.from({ length: 7 }, (_, i) =>
              format(addDays(new Date(), i + 1), "MM/dd/yyyy")
            );
            let choices = [todayDate, ...nextSevenDays];
            //console.log(choices);

            if (focusedValue) {
              // Generate new dates starting with the focusedValue
              const currentYear = new Date().getFullYear();
              //console.log(`current year: ${currentYear}`);
              // Extract month and day from the focused value
              let [month, day, year] = focusedValue.split("/").map(Number);
              //console.log(`month: ${month}, day: ${day}, year: ${year}`);

              if (day === undefined) {
                day = new Date().getDate();
              }

              if (!isValid(new Date(currentYear, month - 1, day))) {
                await interaction.respond([
                  {
                    // What is shown to the user
                    name: "Invalid date",
                    // What is actually used as the option.
                    value: "Invalid date",
                  },
                ]);
                return;
              }

              choices = Array.from({ length: 7 }, (_, i) =>
                format(new Date(currentYear, month - 1, day + i), "MM/dd/yyyy")
              );
            }

            //console.log(choices);
            await interaction.respond(
              choices.map((choice) => ({ name: choice, value: choice }))
            );
          } else if (focusedOption === "time") {
            //console.log("focused value is time");

            // Generate all possible times in 15-minute increments
            const times = [];
            for (let hour = 0; hour < 24; hour++) {
              for (let minute = 0; minute < 60; minute += 15) {
                const time = new Date(0, 0, 0, hour, minute);
                times.push(format(time, "h:mm a")); // Use "h:mm a" for times like "1:00 pm"
              }
            }

            let choices;
            if (focusedValue) {
              // Filter times based on the focusedValue. This tries to match the start of the focusedValue with the start of the formatted time strings.
              const regex = new RegExp(`^${focusedValue}`, "i"); // Case-insensitive match
              choices = times.filter((time) => regex.test(time));
            } else {
              choices = times; // If no focusedValue, show all times
            }

            await interaction.respond(
              choices
                .slice(0, 25)
                .map((choice) => ({ name: choice, value: choice }))
            );
          } else if (focusedOption === "location") {
            //("focused value is location");
            const locations = [
              "Tranqulity Trails",
              "Stafford Woods",
              "Alcyon Woods",
              "New Brookyln",
              "SoVi",
            ];
            await interaction.respond(
              locations.map((location) => ({ name: location, value: location }))
            );
          }
        }
      } catch (error) {
        console.error(error);
        await interaction.respond([
          {
            // What is shown to the user
            name: "Error",
            // What is actually used as the option.
            value: "Error",
          },
        ]);
      }
    }
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN);

const guildIDCron = "1086345260994658425"; // disc guild server

const remindedEventIds = new Set(); // Store event IDs for which reminders have been sent

async function checkAndSendEventReminders() {
  const guild = await client.guilds.fetch(guildIDCron);
  const channelToSendCronJobs = await client.channels.fetch(
    "1220735798312173588"
  ); // Channel ID for reminders
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000); // One hour from now

  const allEvents = await getAllEvents(guildIDCron); // Fetch all events
  const upcomingEvents = allEvents.filter((event) => {
    const eventStart = new Date(event.dateTime);
    return (
      eventStart >= now &&
      eventStart <= oneHourLater &&
      !remindedEventIds.has(event.eventId) &&
      event.guildId === guildIDCron
    ); // Check if the event is within the next hour and not already reminded
  });

  for (const event of upcomingEvents) {
    const { embed } = await createEventEmbed(event, guild, event.eventId); // Create embed for the event
    await channelToSendCronJobs.send({
      content: "🔔 Reminder: An event is starting soon!",
      embeds: [embed],
    });
    remindedEventIds.add(event.eventId); // Mark this event as reminded

    // Schedule to remove the event ID from the set after the event starts
    const eventStart = new Date(event.dateTime);
    const delay = eventStart.getTime() - now.getTime(); // Calculate delay until event start
    setTimeout(() => remindedEventIds.delete(event.eventId), delay);
  }
}

// Schedule the reminder check to run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  await checkAndSendEventReminders();
});

// Schedule the task to run at 9am EST every day
cron.schedule("30 8 * * *", async () => {
  try {
    const guildIDCron = "1086345260994658425"; // disc guild server
    const guild = await client.guilds.fetch(guildIDCron);
    const channelToSendCronJobs = await client.channels.fetch(
      "1220735798312173588"
    ); // The ID of the channel where reminders should be sent
    const today = new Date();
    const allEvents = await getAllEvents(guildIDCron);
    const eventsToday = allEvents.filter(
      (event) =>
        event.dateTime.toDateString() === today.toDateString() &&
        event.guildId === guildIDCron
    );

    if (eventsToday.length > 0) {
      await channelToSendCronJobs.send("These are today's events:");

      const embeds = [];

      for (const event of eventsToday) {
        const { embed } = await createEventEmbed(event, guild, event.eventId);
        embeds.push(embed);
      }

      // Send the embeds to the specified channel

      for (const embed of embeds) {
        await channelToSendCronJobs.send({ embeds: [embed] });
      }
    } else {
      console.log("No events are happening today.");
      // await channelToSendCronJobs.send("No events are happening today.");
    }
  } catch (error) {
    console.error("Error executing cron job:", error);
  }
});

cron.schedule("0 21 * * *", async () => {
  try {
    const guild = await client.guilds.fetch(guildIDCron);
    const channelToSendCronJobs = await client.channels.fetch(
      "1220735798312173588"
    ); // The ID of the channel where reminders should be sent
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1); // Set to tomorrow's date

    const allEvents = await getAllEvents(guildIDCron);
    const eventsTomorrow = allEvents.filter(
      (event) =>
        event.dateTime.toDateString() === tomorrow.toDateString() &&
        event.guildId === guildIDCron
    );

    if (eventsTomorrow.length > 0) {
      // Send the announcement message for tomorrow's events
      await channelToSendCronJobs.send("These are tomorrow's events:");

      const embeds = [];
      for (const event of eventsTomorrow) {
        const { embed } = await createEventEmbed(event, guild, event.eventId);
        embeds.push(embed);
      }

      // Send the embeds for tomorrow's events
      for (const embed of embeds) {
        await channelToSendCronJobs.send({ embeds: [embed] });
      }
    } else {
      // If no events are happening tomorrow, send a message to the channel
      // await channelToSendCronJobs.send("No events are happening tomorrow.");
      console.log("No events are happening tomorrow.");
    }
  } catch (error) {
    console.error("Error executing cron job for tomorrow's events:", error);
  }
});