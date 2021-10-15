const Discord = require('discord.js');
const {
    prefix,
    token,
} = require('./config.json');
const ytdl = require('ytdl-core');
const YoutubeMusicApi = require('youtube-music-api');
const api = new YoutubeMusicApi();
const client = new Discord.Client();
const queue = new Map();

const verifyType = string => {
    let url;

    try {
        url = new URL(string);
    } catch (_) {
        return 'name'
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
        if (!!string.match(/playlist\?list\=(.*)/)) return 'playlist'
        return 'url'
    }
    return 'name'
}

client.once('ready', () => {
    console.log('Ready!');
});
client.once('reconnecting', () => {
    console.log('Reconnecting!');
});
client.once('disconnect', () => {
    console.log('Disconnect!');
});

client.on('message', async message => {
    if (!message.author.bot && message.content.startsWith(prefix)) {
        const serverQueue = queue.get(message.guild.id);

        let command;
        let musicOrPlaylist;

        const getCommandAndMusic = () => message.content.replace(/^(&)([a-zA-Z]+)(.*)$/, (m, m1, m2, m3) => {
            command = m2;
            musicOrPlaylist = m3;
        });

        getCommandAndMusic();
        const functions = {
            play: () => execute(message, musicOrPlaylist, serverQueue, queue),
            p: () => execute(message, musicOrPlaylist, serverQueue, queue),
            //plays: () => executeRandomly(message, serverQueue),
            //ps: () => executeRandomly(message, serverQueue),
            skip: () => skip(message, serverQueue),
            stop: () => stop(message, serverQueue),
            //back: () => back(message, serverQueue),
            //shuffle: () => shuffle(serverQueue),
        }
        if (!functions[command]) return message.channel.send('This command dont exist... We know that is the Devs fault');
        functions[command]();
    }
    return;
});

const skip = (message, serverQueue) => {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music!"
        );
    if (!serverQueue)
        return message.channel.send("There is no song that I could skip!");
    console.log(serverQueue.connection)
    serverQueue.connection.dispatcher.end();
}

const stop = (message, serverQueue) => {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music!"
        );

    if (!serverQueue)
        return message.channel.send("There is no song that I could stop!");

    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
}


const execute = async (message, urlOrName, serverQueue, queue) => {
    const songType = verifyType(urlOrName);
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
        return message.channel.send(
            "You need to be in a voice channel to play music!"
        );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel!"
        );
    }

    const songsInfo = await getSongInfo(urlOrName.trim(), songType);
    const allSongs = songsInfo.map(songInfo => ({
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
    }));

    if (!allSongs || allSongs.length < 1) return message.channel.send("Song infos are not found");


    let count = 0;
    allSongs.forEach(async (song, idx) => {
        if (song) {
            setTimeout(async () => {
            message.channel.send(`Adding **${song.title}**`);
            if (!serverQueue && count === 0) {
                const queueContruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    volume: 5,
                    playing: true
                };

                queue.set(message.guild.id, queueContruct);

                queueContruct.songs.push(song);
                count++;

                try {
                    var connection = await voiceChannel.join();
                    queueContruct.connection = connection;
                    play(message.guild, queueContruct.songs[0], queue);
                } catch (err) {
                    console.log(err);
                    queue.delete(message.guild.id);
                    return message.channel.send(err);
                }
            } else {
                count++;
                if(count > 1) queue.get(message.guild.id).songs.push(song);
                else serverQueue.songs.push(song);
                return message.channel.send(`${song.title} has been added to the queue!`);
            }
            }, idx*3000)
        }
    })
}

const getSongInfo = async (urlOrName, type) => {
    switch (type) {
        case ('url'):
            return ([await ytdl.getInfo(urlOrName)]);
        case ('playlist'):
            return await getMusicByUrl(urlOrName);
        case ('name'):
            return ([await searchMusicByName(urlOrName)]);
    }
}
const searchMusicByName = async (songName) =>
    await api.initalize() // Retrieves Innertube Config
        .then(async info => {
            return api.search(songName, "song").then(res => {
                const result = res.content[0];
                return ({ videoDetails: { video_url: `https://www.youtube.com/watch?v=${result.videoId}`, title: result.name } });
            }) // just search for songs
        })

const getMusicByUrl = async (playlistUrl) =>
    await api.initalize() // Retrieves Innertube Config
        .then(async info => {
            return api.getPlaylist(playlistUrl.match(/playlist\?list\=(.*)/)[1], "song").then(res => {
                const r = res.content.map(result => ({
                    videoDetails: {
                        video_url: `https://www.youtube.com/watch?v=${result.videoId}`, title: result.name
                    }
                }));
                return r;
            }) // just search for songs
        })

const play = (guild, song, queue) => {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on("finish", () => {
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0], queue);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

client.login(token);
