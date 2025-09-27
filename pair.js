const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore, DisconnectReason } = require('@whiskeysockets/baileys')

const { upload } = require('./mega');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).send({ error: "Phone number is required" });
    }

    async function KANGO_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            var items = ["Safari", "Chrome", "Firefox"];
            function selectRandomItem(array) {
                var randomIndex = Math.floor(Math.random() * array.length);
                return array[randomIndex];
            }
            var randomItem = selectRandomItem(items);

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS(randomItem),
                version: [2, 2413, 1] // Important for pairing compatibility
            });

            if (!sock.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await sock.requestPairingCode(num);
                    if (!res.headersSent) {
                        await res.send({ 
                            success: true, 
                            code: code,
                            instructions: "Go to WhatsApp → Linked Devices → Link a Device → Link with phone number"
                        });
                    }
                } catch (pairError) {
                    console.error("Pairing error:", pairError);
                    if (!res.headersSent) {
                        await res.send({ 
                            success: false, 
                            error: "Failed to generate pairing code. Try again." 
                        });
                    }
                    return;
                }
            }

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    await delay(3000);
                    try {
                        let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                        let rf = __dirname + `/temp/${id}/creds.json`;
                        
                        function generateRandomText() {
                            const prefix = "3EB";
                            const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                            let randomText = prefix;
                            for (let i = prefix.length; i < 22; i++) {
                                const randomIndex = Math.floor(Math.random() * characters.length);
                                randomText += characters.charAt(randomIndex);
                            }
                            return randomText;
                        }

                        const randomText = generateRandomText();
                        const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
                        const string_session = mega_url.replace('https://mega.nz/file/', '');
                        let md = "KANGO~" + string_session;
                        
                        let code = await sock.sendMessage(sock.user.id, { text: md });
                        let desc = `*Hello there KANGO-XMD User! 👋🏻* 

> Do not share your session id with your gf 😂.

*Thanks for using KANGO-XMD 🚩* 

> Join WhatsApp Channel :- ⤵️
 
https://whatsapp.com/channel/0029Va8YUl50bIdtVMYnYd0E

Dont forget to fork the repo ⬇️

https://github.com/OfficialKango/KANGO-XMD

> *© Powered BY Hector Manuel 🖤*`; 

                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: "Hector Manuel",
                                    thumbnailUrl: "https://i.imgur.com/GVW7aoD.jpeg",
                                    sourceUrl: "https://whatsapp.com/channel/0029Va8YUl50bIdtVMYnYd0E",
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }  
                            }
                        }, { quoted: code });

                    } catch (e) {
                        console.error("Session save error:", e);
                        let ddd = await sock.sendMessage(sock.user.id, { text: e.toString() });
                        let desc = `*Don't Share with anyone this code use for deploy KANGO-XMD*\n\n ◦ *Github:* https://github.com/OfficialKango/KANGO-XMD`;
                        
                        await sock.sendMessage(sock.user.id, {
                            text: desc,
                            contextInfo: {
                                externalAdReply: {
                                    title: "KANGO-XMD",
                                    thumbnailUrl: "https://i.imgur.com/GVW7aoD.jpeg",
                                    sourceUrl: "https://whatsapp.com/channel/0029Va8YUl50bIdtVMYnYd0E",
                                    mediaType: 2,
                                    renderLargerThumbnail: true,
                                    showAdAttribution: true
                                }  
                            }
                        }, { quoted: ddd });
                    }
                    
                    await delay(100);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                    console.log(`👤 ${sock.user.id} 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱 ✅ 𝗥𝗲𝘀𝘁𝗮𝗿𝘁𝗶𝗻𝗴 𝗽𝗿𝗼𝗰𝗲𝘀𝘀...`);
                    await delay(100);
                    process.exit();
                    
                } else if (connection === "close" && lastDisconnect) {
                    const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                    
                    if (shouldReconnect) {
                        await delay(5000);
                        KANGO_PAIR_CODE();
                    } else {
                        await removeFile('./temp/' + id);
                    }
                }
            });
            
        } catch (err) {
            console.log("Service error:", err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ success: false, error: "Service Unavailable" });
            }
        }
    }
    
    return await KANGO_PAIR_CODE();
});

module.exports = router;