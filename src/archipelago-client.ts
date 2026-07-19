type ArchipelagoWindow = Window & typeof globalThis & {
  phaserGame?: any;
  gameSession?: any;
  ArchipelagoWebExtension?: any;
};

const archipelagoWindow = window as ArchipelagoWindow;

console.log("%c[Archipelago] Initializing native web fork engine...", "color: #00ff00; font-weight: bold;");

class PokeRogueArchipelagoMod {
  ws: WebSocket | null = null;
  isConnected = false;
  lastTrackedWave = 0;
  isMenuVisible = true;
  config = {
    host: localStorage.getItem('ap_web_host') || 'archipelago.gg',
    port: localStorage.getItem('ap_web_port') || '38281',
    slotName: localStorage.getItem('ap_web_slot') || 'pokeroguetest',
    password: localStorage.getItem('ap_web_pass') || '',
  };

  onInitialize() {
    this.buildFloatingUI();
    this.setupHotkeys();
    setInterval(() => this.scanGameProgression(), 1000);
  }

  buildFloatingUI() {
    if (document.getElementById('ap-web-login-menu')) return;

    const menu = document.createElement('div');
    menu.id = 'ap-web-login-menu';
    menu.className = 'ap-web-login-menu';

    menu.innerHTML = `
      <div class="ap-web-login-menu__title">ARCHIPELAGO LINK</div>
      <div class="ap-web-login-menu__field"><label class="ap-web-login-menu__label">SERVER HOST<br><input type="text" id="ap_web_host" class="ap-web-login-menu__input" value="${this.config.host}"></label></div>
      <div class="ap-web-login-menu__field"><label class="ap-web-login-menu__label">PORT<br><input type="text" id="ap_web_port" class="ap-web-login-menu__input" value="${this.config.port}"></label></div>
      <div class="ap-web-login-menu__field"><label class="ap-web-login-menu__label">SLOT NAME<br><input type="text" id="ap_web_slot" class="ap-web-login-menu__input" value="${this.config.slotName}"></label></div>
      <div class="ap-web-login-menu__field ap-web-login-menu__field--password"><label class="ap-web-login-menu__label">ROOM PASSWORD<br><input type="password" id="ap_web_pass" class="ap-web-login-menu__input" value="${this.config.password}"></label></div>
      <button id="ap_web_connect_btn" class="ap-web-login-menu__connect">CONNECT TO SEED</button>
      <div id="ap_web_status" class="ap-web-login-menu__status">STATUS: DISCONNECTED</div>
      <div class="ap-web-login-menu__hint">PRESS [H] TO HIDE/SHOW MENU</div>
    `;

    const gameContainer = document.getElementById('app');
    if (gameContainer) {
      gameContainer.appendChild(menu);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        const fallback = document.getElementById('app');
        if (fallback) fallback.appendChild(menu);
      });
    }

    const connectButton = document.getElementById('ap_web_connect_btn');
    if (connectButton) {
      connectButton.addEventListener('click', () => this.triggerUIConnection());
    }
  }

  setupHotkeys() {
    window.addEventListener('keydown', (event) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        this.isMenuVisible = !this.isMenuVisible;
        const menu = document.getElementById('ap-web-login-menu');
        if (menu) {
          menu.classList.toggle('is-hidden', !this.isMenuVisible);
        }
      }
    });
  }

  triggerUIConnection() {
    this.config.host = (document.getElementById('ap_web_host') as HTMLInputElement)?.value.trim() || this.config.host;
    this.config.port = (document.getElementById('ap_web_port') as HTMLInputElement)?.value.trim() || this.config.port;
    this.config.slotName = (document.getElementById('ap_web_slot') as HTMLInputElement)?.value.trim() || this.config.slotName;
    this.config.password = (document.getElementById('ap_web_pass') as HTMLInputElement)?.value.trim() || this.config.password;

    localStorage.setItem('ap_web_host', this.config.host);
    localStorage.setItem('ap_web_port', this.config.port);
    localStorage.setItem('ap_web_slot', this.config.slotName);
    localStorage.setItem('ap_web_pass', this.config.password);

    const statusDiv = document.getElementById('ap_web_status');
    if (statusDiv) {
      statusDiv.innerText = 'STATUS: INITIALIZING...';
      statusDiv.style.color = '#f8d030';
    }

    this.connectToMultiworld();
  }

  connectToMultiworld() {
    if (this.ws) {
      this.ws.close();
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      const statusDiv = document.getElementById('ap_web_status');
      if (statusDiv) {
        statusDiv.innerText = 'STATUS: HANDSHAKE...';
      }
    };

    this.ws.onmessage = (event) => {
      const packets = JSON.parse(event.data);
      packets.forEach((packet: any) => {
        const statusDiv = document.getElementById('ap_web_status');

        switch (packet.cmd) {
          case 'RoomInfo': {
            const connectPacket = [{
              cmd: 'Connect',
              game: 'PokeRogue',
              name: this.config.slotName,
              password: this.config.password,
              uuid: 'pokerogue_web_fork',
              tags: ['Tracker'],
              version: { major: 0, minor: 5, build: 0, class: 'Version' },
              items_handling: 7,
            }];
            this.ws?.send(JSON.stringify(connectPacket));
            break;
          }

          case 'Connected':
            this.isConnected = true;
            if (statusDiv) {
              statusDiv.innerText = 'STATUS: CONNECTED';
              statusDiv.style.color = '#58a858';
            }
            if (packet.slot_data && packet.received_items) {
              packet.received_items.forEach((item: any) => this.handleIncomingItem(item.item));
            }
            break;

          case 'ReceivedItems':
            packet.items.forEach((item: any) => this.handleIncomingItem(item.item));
            break;

          case 'ConnectionRefused':
            this.isConnected = false;
            if (statusDiv) {
              statusDiv.innerText = 'REFUSED';
              statusDiv.style.color = '#f05030';
            }
            break;
        }
      });
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      const statusDiv = document.getElementById('ap_web_status');
      if (statusDiv && !statusDiv.innerText.startsWith('REFUSED')) {
        statusDiv.innerText = 'STATUS: DISCONNECTED';
        statusDiv.style.color = '#f05030';
      }
    };
  }

  scanGameProgression() {
    if (archipelagoWindow.phaserGame && archipelagoWindow.phaserGame.scene) {
      const activeScene = archipelagoWindow.phaserGame.scene.scenes.find((scene: any) => scene.currentWave !== undefined);
      if (activeScene && activeScene.currentWave !== this.lastTrackedWave) {
        this.lastTrackedWave = activeScene.currentWave;
        this.onWaveChanged(this.lastTrackedWave);
      }
    }
  }

  onWaveChanged(currentWave: number) {
    console.log(`[Archipelago] Wave detected: ${currentWave}`);
    const maxGoalWave = 150;

    if (currentWave % 10 === 0 && currentWave <= maxGoalWave) {
      const locationId = 890000 + currentWave;
      this.sendLocationCheck(locationId);

      if (currentWave === maxGoalWave) {
        const statusPacket = [{ cmd: 'StatusUpdate', status: 30 }];
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(statusPacket));
        }
      }
    }
  }

  sendLocationCheck(locationId: number) {
    if (!this.isConnected) return;
    console.log(`[Archipelago] Transmitting Location Check ID: ${locationId}`);

    const checkPacket = [{ cmd: 'LocationChecks', locations: [locationId] }];
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(checkPacket));
    }
  }

  handleIncomingItem(itemId: number) {
    console.log(`[Archipelago] Processing item unlock packet: ${itemId}`);

    if (itemId >= 95000 && itemId <= 95999) {
      const pokedexId = itemId - 95000;
      if (archipelagoWindow.gameSession?.userData?.starters?.[pokedexId]) {
        archipelagoWindow.gameSession.userData.starters[pokedexId].unlocked = true;
      }
    }

    switch (itemId) {
      case 91001:
        if (archipelagoWindow.gameSession?.userData) {
          if (!archipelagoWindow.gameSession.userData.vouchers) archipelagoWindow.gameSession.userData.vouchers = {};
          archipelagoWindow.gameSession.userData.vouchers['1'] = (archipelagoWindow.gameSession.userData.vouchers['1'] || 0) + 1;
          console.log('[Archipelago] Added 1x Regular Egg Voucher!');
        }
        break;

      case 91005:
        if (archipelagoWindow.gameSession?.userData) {
          if (!archipelagoWindow.gameSession.userData.vouchers) archipelagoWindow.gameSession.userData.vouchers = {};
          archipelagoWindow.gameSession.userData.vouchers['2'] = (archipelagoWindow.gameSession.userData.vouchers['2'] || 0) + 1;
          console.log('[Archipelago] Added 1x Plus Egg Voucher!');
        }
        break;

      case 91010:
        if (archipelagoWindow.gameSession?.userData) {
          if (!archipelagoWindow.gameSession.userData.vouchers) archipelagoWindow.gameSession.userData.vouchers = {};
          archipelagoWindow.gameSession.userData.vouchers['3'] = (archipelagoWindow.gameSession.userData.vouchers['3'] || 0) + 1;
          console.log('[Archipelago] Added 1x Premium Egg Voucher!');
        }
        break;

      case 91025:
        if (archipelagoWindow.gameSession?.userData) {
          if (!archipelagoWindow.gameSession.userData.vouchers) archipelagoWindow.gameSession.userData.vouchers = {};
          archipelagoWindow.gameSession.userData.vouchers['4'] = (archipelagoWindow.gameSession.userData.vouchers['4'] || 0) + 1;
          console.log('[Archipelago] Added 1x Gold Egg Voucher!');
        }
        break;

      case 90001:
        archipelagoWindow.gameSession?.activeBattle?.modifiers?.addModifier('EXP_SHARE');
        break;

      case 90002:
        archipelagoWindow.gameSession?.activeBattle?.modifiers?.addModifier('SHINY_CHARM');
        break;
    }
  }
}

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('/service-worker.js');
  } catch (error) {
    console.warn('[Archipelago] Service worker registration skipped:', error);
  }
};

const bootArchipelagoClient = () => {
  if (archipelagoWindow.ArchipelagoWebExtension) return;

  const instance = new PokeRogueArchipelagoMod();
  instance.onInitialize();
  archipelagoWindow.ArchipelagoWebExtension = instance;
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', async () => {
    await registerServiceWorker();
    bootArchipelagoClient();
  }, { once: true });
} else {
  void registerServiceWorker();
  bootArchipelagoClient();
}
