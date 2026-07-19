window.loadedMods = window.loadedMods || [];

class PokeRogueArchipelagoMod {
    constructor() {
        this.metadata = { 
            name: "Archipelago Multiworld Sync", 
            version: "1.0.0" 
        };
        
        // --- Core Server State Variables ---
        this.ws = null;
        this.isConnected = false;
        this.lastTrackedWave = 0;
        
        // --- Configure Your Connection Parameters Here ---
        this.config = {
            host: "archipelago.gg", // Replace with your target host or local IP
            port: 38281,            // Replace with your room's port number
            slotName: "Trainer",    // Replace with your exact Slot Name from the YAML
            password: ""            // Leave empty string if no password is set
        };
    }

    // Called automatically by your src/main.ts loader script
    onInitialize(gameInstance) { 
        console.log(`[Archipelago] ${this.metadata.name} successfully activated!`); 
        
        // 1. Establish the network handshake with the Archipelago server
        this.connectToMultiworld();

        // 2. Spin up an engine scanner interval loop to check game variables every second
        setInterval(() => this.scanGameProgression(), 1000);
    }

    // --- 1. WebSocket Network Implementation ---
    connectToMultiworld() {
        const url = `ws://${this.config.host}:${this.config.port}`;
        console.log(`[Archipelago] Connecting to server at ${url}...`);
        
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            // Step 1: Send Room Identification & Hello Packets
            const connectPacket = [{
                cmd: "Connect",
                game: "PokeRogue", // Must exactly match the "game" name string in your python .apworld
                name: this.config.slotName,
                password: this.config.password,
                uuid: "pokerogue_client_session",
                tags: [],
                version: { major: 0, minor: 5, build: 0 }, // AP Protocol validation signature
                items_handling: 7 // Ask server to keep track of ALL item indices remotely
            }];
            this.ws.send(JSON.stringify(connectPacket));
        };

        this.ws.onmessage = (event) => {
            const packets = JSON.parse(event.data);
            packets.forEach(packet => {
                switch(packet.cmd) {
                    case "Connected":
                        this.isConnected = true;
                        console.log(`%c[Archipelago] Successfully connected to Slot: ${this.config.slotName}!`, "color: #00ff00; font-weight: bold;");
                        break;
                    case "ReceivedItems":
                        // Server is informing us we have items waiting or discovered
                        packet.items.forEach(item => this.handleIncomingItem(item.item));
                        break;
                    case "ConnectionRefused":
                        console.error(`[Archipelago] Connection Refused: ${packet.errors.join(", ")}`);
                        break;
                }
            });
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            console.warn("[Archipelago] Connection dropped. Retrying in 10 seconds...");
            setTimeout(() => this.connectToMultiworld(), 10000);
        };
    }

    // --- 2. Intercepting Ingame Events ---
    scanGameProgression() {
        // Safe reference search targeting PokéRogue's global canvas loops
        if (window.phaserGame && window.phaserGame.scene) {
            // Find the active running scene context handling the battles
            const activeScene = window.phaserGame.scene.scenes.find(s => s.currentWave !== undefined);
            
            if (activeScene && activeScene.currentWave !== this.lastTrackedWave) {
                this.lastTrackedWave = activeScene.currentWave;
                this.onWaveChanged(this.lastTrackedWave);
            }
        }
    }

    onWaveChanged(currentWave) {
        console.log(`[Archipelago] Intercepted run transition. Current wave: ${currentWave}`);
        
        // --- Custom Mapping Logic ---
        // Match this equation to how you structured the IDs inside your python script.
        // Example: If Wave 10 is mapped to ID 80010 in your .apworld:
        if (currentWave % 10 === 0) { 
            const locationId = 80000 + currentWave;
            this.sendLocationCheck(locationId);
        }
    }

    sendLocationCheck(locationId) {
        if (!this.isConnected) {
            console.warn(`[Archipelago] Cannot send check for ID ${locationId}: Not connected to server.`);
            return;
        }

        console.log(`%c[Archipelago] Sending check to multiworld for Location ID: ${locationId}`, "color: #00bfff;");
        const checkPacket = [{
            cmd: "LocationChecks",
            locations: [locationId]
        }];
        this.ws.send(JSON.stringify(checkPacket));
    }

    // --- 3. Injecting Items Back into PokeRogue ---
    handleIncomingItem(itemId) {
        console.log(`%c[Archipelago] Incoming network item received. ID: ${itemId}`, "color: #ff8c00;");
        
        // TODO: Bridge this parameter map to target your specific item reward index configurations.
        // Example logic:
        // if (itemId === 90001) { window.gameSession.activeBattle.modifiers.addModifier("EXP_SHARE"); }
    }
}

// Register the finalized configuration instance to the global loader context
window.loadedMods.push(new PokeRogueArchipelagoMod());
