/* =========================================================================
   FEFC Collection - Elon Musk, SpaceX, Tesla, xAI & Boring Company Easter Eggs
   ========================================================================= */
(function(){
  const S = window.SFX || {};
  const $ = s => document.querySelector(s);

  function toast(msg, duration = 3200){
    let el = document.getElementById('ee-toast');
    if(!el){
      el = document.createElement('div');
      el.id = 'ee-toast';
      document.body.appendChild(el);
    }
    el.innerHTML = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* -------------------------------------------------------------------------
     1. SPACEX MECHAZILLA CHOPSTICK CATCH (Double Esc or "chopsticks"/"mechazilla")
     ------------------------------------------------------------------------- */
  let lastEscTime = 0;
  function triggerMechazilla(){
    let el = document.getElementById('mechazilla-overlay');
    if(!el){
      el = document.createElement('div');
      el.id = 'mechazilla-overlay';
      el.innerHTML = `
        <div class="ch-arm left"><div class="ch-hydraulic"></div><div class="ch-pin"></div><div class="ch-stripe"></div></div>
        <div class="ch-arm right"><div class="ch-hydraulic"></div><div class="ch-pin"></div><div class="ch-stripe"></div></div>
        <div class="ch-hud"><span class="ch-icon">🦾</span><b>MECHAZILLA CATCH CONFIRMED</b><small>SUPER HEAVY BOOSTER CAUGHT IN MID-AIR</small></div>
      `;
      document.body.appendChild(el);
    }
    if(S.chopstick) S.chopstick();
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 2800);
  }

  /* -------------------------------------------------------------------------
     2. SPACEX ORBITAL TELEMETRY HUD (Key "O")
     ------------------------------------------------------------------------- */
  let hudEl = null, hudTimer = null, telemetryActive = false;
  let hudAlt = 186.4, hudVel = 27485, hudPitch = 4.2;

  function toggleTelemetryHUD(){
    telemetryActive = !telemetryActive;
    if(!hudEl){
      hudEl = document.createElement('div');
      hudEl.id = 'spacex-hud';
      hudEl.innerHTML = `
        <div class="hud-top">
          <span class="hud-tag">SPACEX STARSHIP FLIGHT TELEMETRY (IFT)</span>
          <span class="hud-clock" id="hud-clock">T+ 00:08:42</span>
        </div>
        <div class="hud-grid">
          <div class="hud-cell"><small>ALTITUDE</small><b id="hud-alt">186.4 km</b></div>
          <div class="hud-cell"><small>SPEED</small><b id="hud-vel">27,485 km/h</b><span class="hud-sub">Mach 22.4</span></div>
          <div class="hud-cell"><small>RAPTOR 2 ENGINES</small><b style="color:#38bdf8">6/6 NOMINAL</b><span class="hud-sub">315 bar</span></div>
          <div class="hud-cell"><small>PROPELLANT</small><b>CH4 65% · LOX 68%</b></div>
          <div class="hud-cell span2"><small>ATTITUDE GIMBALS</small><div class="hud-gyro"><span>PITCH: <i id="hud-p">+4.2°</i></span><span>ROLL: 0.0°</span><span>YAW: -0.3°</span></div></div>
        </div>
        <div class="hud-foot">Press <b>O</b> to toggle telemetry HUD</div>
      `;
      document.body.appendChild(hudEl);
    }
    hudEl.classList.toggle('visible', telemetryActive);
    if(S.click) S.click();
    if(telemetryActive){
      toast('🚀 SpaceX Starship Telemetry HUD [O] Active');
      clearInterval(hudTimer);
      let sec = 522;
      hudTimer = setInterval(() => {
        if(!telemetryActive) return;
        sec++;
        const m = Math.floor(sec/60), s = sec%60;
        const clk = document.getElementById('hud-clock');
        if(clk) clk.textContent = `T+ 00:${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
        hudAlt += 0.05;
        hudVel += (Math.random()*6 - 2.8);
        hudPitch = 4.0 + Math.sin(sec*0.2)*0.4;
        const eAlt = document.getElementById('hud-alt'), eVel = document.getElementById('hud-vel'), eP = document.getElementById('hud-p');
        if(eAlt) eAlt.textContent = hudAlt.toFixed(1) + ' km';
        if(eVel) eVel.textContent = Math.round(hudVel).toLocaleString() + ' km/h';
        if(eP) eP.textContent = (hudPitch >= 0 ? '+' : '') + hudPitch.toFixed(1) + '°';
      }, 1000);
    } else {
      clearInterval(hudTimer);
    }
  }

  /* -------------------------------------------------------------------------
     3. SPACEX STARSHIP HOT STAGING (Triggered on Shuffle Play)
     ------------------------------------------------------------------------- */
  function triggerHotStaging(cb){
    let el = document.getElementById('hotstage-blast');
    if(!el){
      el = document.createElement('div');
      el.id = 'hotstage-blast';
      el.innerHTML = `
        <div class="hs-ring"></div>
        <div class="hs-core"></div>
        <div class="hs-txt">🔥 STARSHIP HOT STAGING SEPARATION<br><small>WARPING TO RANDOM FAN EDIT</small></div>
      `;
      document.body.appendChild(el);
    }
    if(S.hotStage) S.hotStage();
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
    setTimeout(() => {
      if(cb) cb();
      setTimeout(() => el.classList.remove('fire'), 600);
    }, 550);
  }
  window.FEFCHotStage = triggerHotStaging;

  /* -------------------------------------------------------------------------
     4. TESLA LUDICROUS / PLAID SPEED WARP (Triple click logo or "plaid")
     ------------------------------------------------------------------------- */
  let plaidActive = false, plaidTimer = null;
  function triggerPlaidMode(){
    if(plaidActive) return;
    plaidActive = true;
    if(S.warp) S.warp();
    document.body.classList.add('plaid-warp');
    toast('⚡ <b>PLAID MODE ENGAGED</b> — 0 to 60 MPH in 1.99s! Hyper-speed vault scrolling active!', 4500);
    clearTimeout(plaidTimer);
    plaidTimer = setTimeout(() => {
      document.body.classList.remove('plaid-warp');
      plaidActive = false;
      toast('⚡ Plaid Mode decelerated back to sub-light speeds.');
    }, 10000);
  }

  // Triple-click brand logo
  let logoClicks = 0, logoClickTimer = null;
  document.addEventListener('click', e => {
    if(e.target.closest('#brand')){
      logoClicks++;
      clearTimeout(logoClickTimer);
      if(logoClicks >= 3){
        logoClicks = 0;
        triggerPlaidMode();
      } else {
        logoClickTimer = setTimeout(() => { logoClicks = 0; }, 500);
      }
    }
  });

  /* -------------------------------------------------------------------------
     5. CYBERTRUCK ARMOR GLASS TEST ("cybertruck")
     ------------------------------------------------------------------------- */
  function triggerCybertruckTest(){
    let wrap = document.getElementById('cybertruck-test');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'cybertruck-test';
      wrap.innerHTML = `
        <div class="ct-ball" id="ct-ball"></div>
        <div class="ct-crack" id="ct-crack">
          <svg viewBox="0 0 200 200" class="crack-svg">
            <circle cx="100" cy="100" r="18" fill="rgba(255,255,255,0.7)"/>
            <path d="M100 100 L30 40 M100 100 L170 30 M100 100 L180 140 M100 100 L120 185 M100 100 L40 160 M100 100 L15 105 M100 100 L105 15 M40 80 L70 50 L100 70 L140 50 L160 90 L130 130 L90 150 L50 120 Z" stroke="#ffffff" stroke-width="2.5" fill="none" opacity="0.9"/>
          </svg>
          <div class="ct-quote">“Franz von Holzhausen: It didn't go through!” 🔨</div>
        </div>
      `;
      document.body.appendChild(wrap);
    }
    wrap.classList.remove('active');
    void wrap.offsetWidth;
    wrap.classList.add('active');
    setTimeout(() => { if(S.glassCrack) S.glassCrack(); }, 350);
    setTimeout(() => { wrap.classList.remove('active'); }, 4200);
  }

  /* -------------------------------------------------------------------------
     6. TESLA FSD (FULL SELF-DRIVING) AUTOPILOT (Key "A")
     ------------------------------------------------------------------------- */
  let fsdActive = false, fsdTimer = null, fsdTargetIndex = 0;
  function toggleFSDMode(){
    fsdActive = !fsdActive;
    let pill = document.getElementById('fsd-pill');
    if(!pill){
      pill = document.createElement('div');
      pill.id = 'fsd-pill';
      pill.innerHTML = `
        <svg class="fsd-wheel" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 12h5m6 0h5M12 12v7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        <span>FSD Beta v12.5 • Autonomous Vault Cruise</span>
      `;
      document.body.appendChild(pill);
    }
    pill.classList.toggle('active', fsdActive);
    if(S.apChime) S.apChime(fsdActive);

    if(fsdActive){
      toast('🚗 <b>Tesla FSD v12.5 Autopilot Engaged!</b> Hands on the wheel. Press any key to take over.', 3800);
      clearInterval(fsdTimer);
      fsdTimer = setInterval(() => {
        if(!fsdActive) return;
        const tiles = Array.from(document.querySelectorAll('#grid .ol-tile:not([hidden]), #arena .ol-tile:not([hidden])'))
          .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        if(!tiles.length) return;
        fsdTargetIndex = (fsdTargetIndex + 1) % tiles.length;
        const target = tiles[fsdTargetIndex];
        document.querySelectorAll('.fsd-box').forEach(b => b.remove());
        const box = document.createElement('div');
        box.className = 'fsd-box';
        box.innerHTML = `<span>[VISION] 99.4%</span>`;
        target.appendChild(box);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if(target.focus) target.focus({ preventScroll: true });
        if(S.chirp) S.chirp(1);
      }, 3400);
    } else {
      clearInterval(fsdTimer);
      document.querySelectorAll('.fsd-box').forEach(b => b.remove());
      toast('🚗 Tesla Autopilot Disengaged.');
    }
  }

  /* -------------------------------------------------------------------------
     7. TESLA HORN & BOOMBOX WHOOPEE CUSHION (Key "H")
     ------------------------------------------------------------------------- */
  let hornCount = 0;
  function triggerTeslaHorn(){
    hornCount++;
    if(hornCount % 2 === 1){
      if(S.fart) S.fart();
      toast('💨 <b>Tesla Boombox:</b> Whoopee cushion deployed!');
    } else {
      if(S.horn) S.horn();
      toast('📯 <b>Tesla Horn:</b> Beep beep!');
    }
  }

  /* -------------------------------------------------------------------------
     8. xAI GROK "UNHINGED MODE" IN SEARCH
     ------------------------------------------------------------------------- */
  let grokMode = false;
  window.FEFCGrok = {
    get isGrok(){ return grokMode; },
    toggle(){
      grokMode = !grokMode;
      const btn = document.getElementById('sp-grok');
      if(btn) btn.classList.toggle('on', grokMode);
      const bText = document.querySelector('#sp-grok .gk-val');
      if(bText) bText.textContent = grokMode ? 'ON' : 'OFF';
      const promptText = document.querySelector('.sp-say');
      if(promptText && grokMode) promptText.textContent = '🤖 Grok Mode ON: Cosmic curiosity and maximum sarcasm.';
      toast(grokMode ? '🤖 <b>Grok Mode Engaged!</b> Unfiltered wit & sarcastic roasts enabled.' : '🤖 Grok Mode deactivated.');
      if(S.click) S.click();
    },
    roast(title){
      const t = (title||'').toLowerCase();
      if(t.includes('star wars')) return 'Farm boy joins space cult to commit patricide. Recommended by 10/10 droids.';
      if(t.includes('star trek')) return 'Space diplomats violate the prime directive for the 47th time this week.';
      if(t.includes('dune')) return 'Sand, spice, and sand in places sand should never be.';
      if(t.includes('matrix')) return 'Office drone swallows suspicious red pill from stranger to dodge Excel spreadsheets.';
      if(t.includes('back to the future')) return 'Teen travels back in time to dodge his mom and invent rock and roll.';
      if(t.includes('jurassic')) return 'Billionaire cuts corners on IT contractor; dinosaurs eat everyone. Quality life choices.';
      if(t.includes('spider')) return 'Radioactive arachnid bites teenager; teenager fights elderly men in animal costumes.';
      if(t.includes('batman')) return 'Billionaire beats up mentally ill orphans in alleys instead of funding Gotham healthcare.';
      if(t.includes('terminator')) return 'Austrian bodybuilder arrives naked from the future to terminate Windows updates.';
      if(t.includes('interstellar')) return 'Dad abandons children for 80 years because of a dust storm, communicates through bookshelf.';
      if(t.includes('hobbit') || t.includes('rings')) return 'Nine-hour hike to return a piece of jewelry into an active volcano.';
      return 'Grok rating: 42/42. A masterpiece of human cinematic re-engineering.';
    }
  };

  /* -------------------------------------------------------------------------
     9. HITCHHIKER'S GUIDE "DON'T PANIC / 42" (Keys 4 then 2)
     ------------------------------------------------------------------------- */
  let lastKey4Time = 0;
  function trigger42Terminal(){
    let el = document.getElementById('terminal-42');
    if(!el){
      el = document.createElement('div');
      el.id = 'terminal-42';
      el.innerHTML = `
        <div class="hitch-box">
          <div class="hitch-head">THE HITCHHIKER'S GUIDE TO THE GALAXY</div>
          <h1>DON'T PANIC</h1>
          <p>The Answer to the Ultimate Question of Life, the Universe, and The Fan Edit Fan Club is:</p>
          <div class="hitch-42">42</div>
          <small>“Time is an illusion. Lunchtime doubly so. Always know where your towel is.”</small>
        </div>
      `;
      document.body.appendChild(el);
      el.addEventListener('click', () => el.classList.remove('active'));
    }
    if(S.retro42) S.retro42();
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 5200);
  }

  /* -------------------------------------------------------------------------
     10. THE BORING COMPANY "NOT A FLAMETHROWER"
     ------------------------------------------------------------------------- */
  let flameActive = false, flameCanvas = null, flameCtx = null, particles = [], flameRAF = null;
  function toggleFlamethrower(){
    flameActive = !flameActive;
    document.body.classList.toggle('flamethrower-active', flameActive);
    if(flameActive){
      toast('🔥 <b>Not A Flamethrower Active!</b> Click anywhere to blast flames!', 3800);
      if(!flameCanvas){
        flameCanvas = document.createElement('canvas');
        flameCanvas.id = 'flame-canvas';
        document.body.appendChild(flameCanvas);
        const sz = () => { flameCanvas.width = innerWidth; flameCanvas.height = innerHeight; };
        sz();
        window.addEventListener('resize', sz);
        flameCtx = flameCanvas.getContext('2d');
      }
      flameCanvas.style.display = 'block';
      let lastX = innerWidth/2, lastY = innerHeight/2;
      window.addEventListener('pointermove', e => {
        if(!flameActive) return;
        lastX = e.clientX; lastY = e.clientY;
        for(let i=0; i<3; i++){
          particles.push({
            x: lastX + (Math.random()*12 - 6),
            y: lastY + (Math.random()*12 - 6),
            vx: (Math.random()*2 - 1),
            vy: -(Math.random()*3 + 1),
            life: 1,
            size: Math.random()*8 + 4
          });
        }
      });
      window.addEventListener('click', e => {
        if(!flameActive) return;
        if(S.flame) S.flame();
        for(let i=0; i<45; i++){
          const angle = (Math.random() - 0.5) * 0.8 - Math.PI/2;
          const spd = Math.random()*14 + 6;
          particles.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle)*spd,
            vy: Math.sin(angle)*spd,
            life: 1,
            size: Math.random()*18 + 8
          });
        }
      });
      function loop(){
        if(!flameActive){
          if(flameCanvas) flameCanvas.style.display = 'none';
          return;
        }
        flameCtx.clearRect(0,0,flameCanvas.width,flameCanvas.height);
        for(let i=particles.length-1; i>=0; i--){
          const p = particles[i];
          p.x += p.vx; p.y += p.vy;
          p.life -= 0.035;
          p.size *= 0.96;
          if(p.life <= 0){ particles.splice(i,1); continue; }
          const g = flameCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, `rgba(255, 245, 160, ${p.life})`);
          g.addColorStop(0.4, `rgba(255, 140, 20, ${p.life*0.9})`);
          g.addColorStop(0.8, `rgba(230, 40, 20, ${p.life*0.6})`);
          g.addColorStop(1, 'rgba(100, 0, 0, 0)');
          flameCtx.fillStyle = g;
          flameCtx.beginPath();
          flameCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
          flameCtx.fill();
        }
        flameRAF = requestAnimationFrame(loop);
      }
      loop();
    } else {
      if(flameCanvas) flameCanvas.style.display = 'none';
      toast('🔥 Not A Flamethrower deactivated.');
    }
  }

  /* -------------------------------------------------------------------------
     11. THE BORING COMPANY HYPERLOOP TUNNEL MODE
     ------------------------------------------------------------------------- */
  let tunnelActive = false;
  function toggleTunnelMode(){
    tunnelActive = !tunnelActive;
    document.body.classList.toggle('tunnel-mode', tunnelActive);
    if(S.click) S.click();
    toast(tunnelActive ? '🚇 <b>Boring Company Hyperloop Mode Active!</b> 150 MPH underground.' : '🚇 Hyperloop Tunnel Mode deactivated.');
  }

  /* -------------------------------------------------------------------------
     GLOBAL KEYBOARD SHORTCUTS & INPUT LISTENERS
     ------------------------------------------------------------------------- */
  document.addEventListener('keydown', e => {
    const isInput = e.target && /INPUT|TEXTAREA/i.test(e.target.tagName);
    const key = e.key;

    // Double Esc -> Mechazilla Chopsticks
    if(key === 'Escape'){
      const now = Date.now();
      if(now - lastEscTime < 420){
        e.preventDefault();
        lastEscTime = 0;
        triggerMechazilla();
        return;
      }
      lastEscTime = now;
      if(flameActive) toggleFlamethrower();
      return;
    }

    if(isInput) return;

    // Keys "4" then "2" -> Don't Panic 42
    if(key === '4'){
      lastKey4Time = Date.now();
      return;
    }
    if(key === '2' && (Date.now() - lastKey4Time < 900)){
      e.preventDefault();
      lastKey4Time = 0;
      trigger42Terminal();
      return;
    }

    // Key "O" -> SpaceX Telemetry HUD
    if(key === 'o' || key === 'O'){
      e.preventDefault();
      toggleTelemetryHUD();
      return;
    }

    // Key "A" -> Tesla FSD Autopilot
    if(key === 'a' || key === 'A'){
      e.preventDefault();
      toggleFSDMode();
      return;
    }

    // Key "H" -> Tesla Horn / Fart
    if(key === 'h' || key === 'H'){
      e.preventDefault();
      triggerTeslaHorn();
      return;
    }

    // Any other key disengages FSD
    if(fsdActive && !['Shift','Control','Alt','Meta'].includes(key)){
      toggleFSDMode();
    }
  });

  // Export functions to global scope for search keywords and app integration
  window.FEFCEasterEggs = {
    triggerMechazilla,
    toggleTelemetryHUD,
    triggerHotStaging,
    triggerPlaidMode,
    triggerCybertruckTest,
    toggleFSDMode,
    triggerTeslaHorn,
    toggleFlamethrower,
    toggleTunnelMode,
    trigger42Terminal
  };
})();
