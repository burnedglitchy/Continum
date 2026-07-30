const { PresenceUpdateStatus } = require('discord.js');
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require("@discordjs/voice");
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
require('dotenv').config();

const port = process.env.PORT || 4000;
const configPath = path.join(__dirname, 'config.json');

/**
 * Multi-instance state map:
 * key: instanceId (string, e.g. "1", "2")
 * value: {
 *   id: string,
 *   token: string,
 *   spamChannelId: string,
 *   spamMin: number,
 *   spamMax: number,
 *   spamEnabled: boolean,
 *   spamTimeout: Timeout|null,
 *   client: Client,
 *   state: {
 *     isConnected: boolean,
 *     connection: VoiceConnection|null,
 *     muted: boolean,
 *     deafened: boolean,
 *     history: { guildId: string|null, channelId: string|null },
 *     guildName: string|null,
 *     guildIconURL: string|null,
 *     channelName: string|null
 *   }
 * }
 */

const instances = new Map();
let activeInstanceId = "1";

function loadConfig() {
    let rawData = {};
    if (fs.existsSync(configPath)) {
        try {
            rawData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            console.error('Error reading config.json:', e.message);
        }
    }

    let configInstances = rawData.instances;

    // Migration rule: If no instances array present, migrate from .env / legacy config.json
    if (!Array.isArray(configInstances) || configInstances.length === 0) {
        const legacyToken = (rawData.Token && rawData.Token !== "tokenhere") ? rawData.Token : (process.env.TOKEN || "");
        const legacySpamChannel = rawData.Channel || process.env.SPAM_CHANNEL_ID || "";
        configInstances = [
            {
                id: "1",
                token: legacyToken,
                spamChannelId: legacySpamChannel,
                spamMin: 60,
                spamMax: 120,
                spamEnabled: false
            }
        ];
        const newConfig = { instances: configInstances };
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    }

    for (const instConfig of configInstances) {
        createInstance(instConfig);
    }

    if (instances.size > 0 && !instances.has(activeInstanceId)) {
        activeInstanceId = instances.keys().next().value;
    }
}

function saveConfig() {
    const data = {
        instances: Array.from(instances.values()).map(inst => ({
            id: inst.id,
            token: inst.token,
            spamChannelId: inst.spamChannelId,
            spamMin: inst.spamMin,
            spamMax: inst.spamMax,
            spamEnabled: inst.spamEnabled
        }))
    };
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function createInstance(configData) {
    const id = String(configData.id);
    const inst = {
        id: id,
        token: configData.token || "",
        spamChannelId: configData.spamChannelId || "",
        spamMin: Number(configData.spamMin) || 60,
        spamMax: Number(configData.spamMax) || 120,
        spamEnabled: Boolean(configData.spamEnabled),
        spamTimeout: null,
        client: new Client({ checkUpdate: false }),
        state: {
            isConnected: false,
            connection: null,
            muted: false,
            deafened: false,
            history: {
                guildId: null,
                channelId: null
            },
            guildName: null,
            guildIconURL: null,
            channelName: null
        }
    };

    inst.client.on('ready', async () => {
        console.log(`[Instance ${inst.id}] Logged in as ${inst.client.user.tag}!`);
        if (inst.spamEnabled) {
            scheduleSpam(inst);
        }
    });

    inst.client.on('presenceUpdate', () => { });
    inst.client.on('userUpdate', () => { });

    if (inst.token) {
        inst.client.login(inst.token).catch(err => {
            console.error(`[Instance ${inst.id}] Login failed:`, err.message);
        });
    }

    instances.set(id, inst);
    return inst;
}

function getRandomInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scheduleSpam(inst) {
    if (inst.spamTimeout) {
        clearTimeout(inst.spamTimeout);
        inst.spamTimeout = null;
    }
    if (!inst.spamEnabled || !inst.spamChannelId || !inst.client?.user) {
        return;
    }

    const minMs = Math.max(10, inst.spamMin) * 1000;
    const maxMs = Math.max(minMs, inst.spamMax * 1000);
    const randomInterval = getRandomInterval(minMs, maxMs);

    inst.spamTimeout = setTimeout(async () => {
        try {
            const channel = await inst.client.channels.cache.get(inst.spamChannelId);
            if (channel) {
                const result = Math.random().toString(36).substring(2, 15);
                await channel.send(result);
            }
        } catch (e) {
            console.error(`[Instance ${inst.id}] Spam error:`, e.message);
        }
        if (inst.spamEnabled) {
            scheduleSpam(inst);
        }
    }, randomInterval);
}

function getActiveInstance() {
    let inst = instances.get(activeInstanceId);
    if (!inst && instances.size > 0) {
        activeInstanceId = instances.keys().next().value;
        inst = instances.get(activeInstanceId);
    }
    return inst;
}

function joinVC(client, guildId, channelId, mute, deaf, instanceId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error(`Guild ${guildId} not found in client cache.`);
    const voiceChannel = guild.channels.cache.get(channelId);
    if (!voiceChannel) throw new Error(`Channel ${channelId} not found in guild cache.`);

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: deaf,
        selfMute: mute,
        group: String(instanceId)
    });
    return connection;
}

async function changeStatus(client, status) {
    if (!client?.user) {
        throw new Error('Discord client user is not ready');
    }

    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    const normalized = status?.toLowerCase();

    if (normalized === 'offline' || normalized === 'invisible') {
        await client.user.setStatus('invisible');
        return 'invisible';
    }

    if (!validStatuses.includes(normalized)) {
        throw new Error(`Invalid status value: ${status}`);
    }

    await client.user.setPresence({ status: normalized });
    return normalized;
}

// App Initialization & Express Routes
loadConfig();

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

function getInstancesArray() {
    return Array.from(instances.values()).map(inst => {
        const user = inst.client?.user;
        let avatarURL = null;
        if (user && typeof user.displayAvatarURL === 'function') {
            avatarURL = user.displayAvatarURL({ dynamic: true, size: 64 });
        }
        return {
            id: inst.id,
            username: user ? (user.username || user.tag) : `Account ${inst.id}`,
            discriminator: user ? (user.discriminator || '0000') : '0000',
            avatarURL: avatarURL,
            status: user?.presence?.status || 'offline',
            isConnected: inst.state.isConnected
        };
    });
}

// GET Dashboard
app.get("/", (req, res) => {
    const active = getActiveInstance();
    res.render('index', {
        activeInstanceId,
        instances: getInstancesArray(),
        discordClient: active?.client || null,
        client: undefined, // avoids EJS reserved option opts.client
        isConnected: active?.state?.isConnected || false,
        muted: active?.state?.muted || false,
        deafened: active?.state?.deafened || false,
        history: active?.state?.history || { guildId: null, channelId: null },
        state: active?.state || {},
        spamConfig: {
            spamChannelId: active?.spamChannelId || "",
            spamMin: active?.spamMin || 60,
            spamMax: active?.spamMax || 120,
            spamEnabled: active?.spamEnabled || false
        }
    });
});

// POST Join Voice Channel
app.post("/join", (req, res) => {
    const active = getActiveInstance();
    if (!active || !active.client) return res.redirect('/');

    const { guildId, channelId, mute, deaf } = req.body;
    const _deaf = Boolean(deaf);
    const _mute = Boolean(mute);

    try {
        active.state.muted = _mute;
        active.state.deafened = _deaf;
        const connection = joinVC(active.client, guildId, channelId, _mute, _deaf, active.id);
        active.state.connection = connection;
        active.state.history.guildId = guildId;
        active.state.history.channelId = channelId;
        active.state.isConnected = true;

        const instRef = active;
        const handleDisconnect = () => {
            instRef.state.isConnected = false;
            instRef.state.connection = null;
        };
        connection.on('stateChange', (oldState, newState) => {
            if (newState.status === 'destroyed' || newState.status === 'disconnected') {
                handleDisconnect();
            }
        });

        // State enrichment for Voice Session card
        const guild = active.client.guilds.cache.get(guildId);
        active.state.guildName = guild?.name || guildId;
        active.state.guildIconURL = guild && typeof guild.iconURL === 'function'
            ? guild.iconURL({ dynamic: true, size: 64 })
            : null;
        const voiceChannel = guild?.channels.cache.get(channelId);
        active.state.channelName = voiceChannel?.name || channelId;
    } catch (err) {
        console.error(`[Instance ${active.id}] Join VC error:`, err.message);
    }

    res.redirect('/');
});

// GET Leave Voice Channel
app.get("/leave", (req, res) => {
    const active = getActiveInstance();
    if (active) {
        if (active.state.connection) {
            try {
                active.state.connection.destroy();
            } catch (e) {
                console.error(`[Instance ${active.id}] Connection destroy error:`, e.message);
            }
        }
        active.state.connection = null;
        active.state.isConnected = false;
        active.state.guildName = null;
        active.state.guildIconURL = null;
        active.state.channelName = null;
    }
    res.redirect('/');
});

// POST Voice Mute Toggle
app.post("/voice/mute", (req, res) => {
    const active = getActiveInstance();
    if (active) {
        active.state.muted = !active.state.muted;
        if (active.state.connection) {
            active.state.connection.rejoin({ selfMute: active.state.muted, selfDeaf: active.state.deafened });
        }
        if (req.xhr || req.headers.accept?.includes('json')) {
            return res.json({ success: true, muted: active.state.muted, deafened: active.state.deafened });
        }
    }
    res.redirect('/');
});

// POST Voice Deafen Toggle
app.post("/voice/deafen", (req, res) => {
    const active = getActiveInstance();
    if (active) {
        active.state.deafened = !active.state.deafened;
        if (active.state.connection) {
            active.state.connection.rejoin({ selfMute: active.state.muted, selfDeaf: active.state.deafened });
        }
        if (req.xhr || req.headers.accept?.includes('json')) {
            return res.json({ success: true, muted: active.state.muted, deafened: active.state.deafened });
        }
    }
    res.redirect('/');
});

// GET Profile API
app.get("/api/profile", (req, res) => {
    const active = getActiveInstance();
    const client = active?.client;
    if (!client?.user) {
        return res.json({
            username: null,
            displayName: null,
            displayAvatarURL: null,
            clanTag: null,
            customStatus: null,
            presenceStatus: 'offline',
            activity: null
        });
    }

    const user = client.user;
    const avatar = typeof user.displayAvatarURL === 'function'
        ? user.displayAvatarURL({ dynamic: true, size: 128 })
        : null;

    const clanTag = user.clan?.tag || null;
    const activities = user.presence && Array.isArray(user.presence.activities)
        ? user.presence.activities.filter(Boolean)
        : [];

    const customActivity = activities.find(a => a.type === 'CUSTOM' || a.type === 4);
    const customStatus = customActivity ? customActivity.state || null : null;

    const richActivity = activities.find(a => a.type !== 'CUSTOM' && a.type !== 4);
    const activity = richActivity ? {
        name: richActivity.name || null,
        type: richActivity.type || null,
        details: richActivity.details || null,
        state: richActivity.state || null
    } : null;

    res.json({
        username: user.username || user.tag || null,
        displayName: user.globalName || user.displayName || user.username || null,
        displayAvatarURL: avatar,
        clanTag: clanTag,
        customStatus: customStatus,
        presenceStatus: user.presence?.status || 'offline',
        activity: activity
    });
});

// GET Login
app.get("/login", (req, res) => {
    const active = getActiveInstance();
    if (active && active.token) {
        active.client.login(active.token).catch(e => console.error(e.message));
    }
    res.send("done");
});

// POST Change Status
app.post("/changestatus", async (req, res) => {
    const active = getActiveInstance();
    const requestedStatus = req.body?.status;
    if (active && active.client) {
        try {
            await changeStatus(active.client, requestedStatus);
        } catch (error) {
            console.error('[changestatus] failed to update status:', error);
        }
    }
    res.redirect('/');
});

// Settings & Instance Management Routes
app.get("/settings", (req, res) => {
    const active = getActiveInstance();
    res.render('settings', {
        activeInstanceId,
        instances: getInstancesArray(),
        activeInstance: active,
        token: active?.token || "",
        spamConfig: {
            spamChannelId: active?.spamChannelId || "",
            spamMin: active?.spamMin || 60,
            spamMax: active?.spamMax || 120,
            spamEnabled: active?.spamEnabled || false
        }
    });
});

app.post("/settings/token", async (req, res) => {
    const active = getActiveInstance();
    if (active) {
        active.token = req.body.token?.trim() || "";
        saveConfig();
        if (active.token) {
            try {
                await active.client.login(active.token);
            } catch (e) {
                console.error(`Token update login failed for instance ${active.id}:`, e.message);
            }
        }
    }
    res.redirect('/settings');
});

app.post("/settings/spam", (req, res) => {
    const active = getActiveInstance();
    if (active) {
        active.spamChannelId = req.body.spamChannelId?.trim() || "";
        active.spamMin = Number(req.body.spamMin) || 60;
        active.spamMax = Number(req.body.spamMax) || 120;
        saveConfig();
        if (active.spamEnabled) {
            scheduleSpam(active);
        }
    }
    res.redirect('/settings');
});

app.post("/settings/spam-toggle", (req, res) => {
    const active = getActiveInstance();
    if (active) {
        active.spamEnabled = !active.spamEnabled;
        saveConfig();
        if (active.spamEnabled) {
            scheduleSpam(active);
        } else if (active.spamTimeout) {
            clearTimeout(active.spamTimeout);
            active.spamTimeout = null;
        }
    }
    res.redirect('/settings');
});

app.post("/settings/reset", (req, res) => {
    const active = getActiveInstance();
    if (active) {
        active.token = "";
        active.spamChannelId = "";
        active.spamMin = 60;
        active.spamMax = 120;
        active.spamEnabled = false;
        if (active.spamTimeout) {
            clearTimeout(active.spamTimeout);
            active.spamTimeout = null;
        }
        if (active.state.connection) {
            try {
                active.state.connection.destroy();
            } catch (e) { }
            active.state.connection = null;
        }
        active.state.isConnected = false;
        saveConfig();
    }
    res.redirect('/settings');
});

app.post("/instance/switch", (req, res) => {
    const { id } = req.body;
    if (id && instances.has(String(id))) {
        activeInstanceId = String(id);
    }
    const referer = req.headers.referer || '';
    res.redirect(referer.includes('/settings') ? '/settings' : '/');
});

app.post("/instance/add", (req, res) => {
    if (instances.size < 2) {
        const token = req.body.token?.trim() || "";
        const newId = instances.has("1") ? "2" : "1";
        createInstance({
            id: newId,
            token: token,
            spamChannelId: "",
            spamMin: 60,
            spamMax: 120,
            spamEnabled: false
        });
        activeInstanceId = newId;
        saveConfig();
    }
    res.redirect('/');
});

app.listen(port, () => {
    console.log(`Continum server listening on http://localhost:${port}`);
});
