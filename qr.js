const { makeid } = require('./gen-id');
const express = require('express');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useSingleFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys')

const sessions = new Map();

router.get('/', async (req, res) => {
    const id = makeid();
    
    res.setTimeout(25000, () => {
        if (!res.headersSent) {
            res.status(500).send({ error: "Request timeout" });
        }
    });

    async function QR_CODE() {
        try {
            const { state, saveState } = useSingleFileAuthState(Buffer.from([]));
            
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                version: [2, 2413, 1],
                markOnlineOnConnect: false
            });

            sock.ev.on('creds.update', saveState);
            
            sock.ev.on("connection.update", async (update) => {
                const { qr, connection } = update;
                
                if (qr && !res.headersSent) {
                    await res.send({ qr: qr });
                }
                
                if (connection === "open") {
                    setTimeout(() => {
                        try {
                            sock.ws.close();
                        } catch (e) {}
                    }, 3000);
                }
            });
            
            sessions.set(id, { sock, saveState });
            
            setTimeout(() => {
                if (sessions.has(id)) {
                    try {
                        sessions.get(id).sock.ws.close();
                        sessions.delete(id);
                    } catch (e) {}
                }
            }, 30000);
            
        } catch (err) {
            if (!res.headersSent) {
                await res.send({ error: "Service unavailable" });
            }
        }
    }
    
    return await QR_CODE();
});

module.exports = router;