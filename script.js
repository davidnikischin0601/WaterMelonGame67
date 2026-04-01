// =============================================================
//  MELON MADNESS 67  –  Retro Arcade Basketball
//  Inspiriert von osteuropäischer Cartoon-Ästhetik
//
//  Steuerung:
//    ← → (oder A/D)   Wolf bewegen
//    Auf den Wolf klicken & wegziehen → Wurfbogen einstellen
//    Loslassen → werfen!
//    Touch wird ebenfalls unterstützt.
// =============================================================

'use strict';

// ── Canvas ────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const W = 800, H = 500;

// ── Spielzustände ─────────────────────────────────────────────
const S = { INTRO: 0, PLAYING: 1, SPECIAL: 2, GAMEOVER: 3 };
let state = S.INTRO;

// ── Spielvariablen ────────────────────────────────────────────
let score        = 0;
let highscore    = parseInt(localStorage.getItem('mm67_hs') || '0');
let combo        = 0;
let gameTime     = 90 * 60;   // Frames (90 Sekunden bei 60 fps)
let frameCount   = 0;
const triggeredSpecials = new Set(); // Scores die bereits einen Special ausgelöst haben

// Prüft ob die Punktzahl den 67-Move auslöst:
//  → Enthält die Ziffer 6 oder 7
//  → ODER Quersumme = 13  (weil 6+7=13)
function isSpecialScore(n) {
    if (n <= 0) return false;
    const s = String(n);
    if (s.includes('6') || s.includes('7')) return true;
    return s.split('').reduce((a, d) => a + parseInt(d), 0) === 13;
}

// Liefert Anzeigetext + Dauer je nach Auslösegrund
function getSpecialInfo(n) {
    const s  = String(n);
    const h6 = s.includes('6'), h7 = s.includes('7');
    const qs = s.split('').reduce((a, d) => a + parseInt(d), 0);
    if (h6 && h7)   return { title: `${n}!`, sub: `★ DER ${n} MOVE! ★`,          dur: 280 };
    if (qs === 13)  return { title: `${n}!`, sub: `★ QUERSUMME 13 MOVE! ★`,      dur: 190 };
    if (h6)         return { title: `${n}!`, sub: `★ DIE SECHS MOVE! ★`,         dur: 155 };
    return                 { title: `${n}!`, sub: `★ DIE SIEBEN MOVE! ★`,        dur: 155 };
}

// ── Bildschirm-Shake ──────────────────────────────────────────
let shakeX = 0, shakeY = 0, shakePow = 0, shakeFrames = 0;
function triggerShake(power, frames) { shakePow = power; shakeFrames = frames; }

// ── Web-Audio-API (Retro-Sounds) ──────────────────────────────
let sfx = null;
function initAudio() {
    if (sfx) return;
    try { sfx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function tone(freq, dur, type = 'square', vol = 0.25, startOffset = 0) {
    if (!sfx) return;
    try {
        const o = sfx.createOscillator();
        const g = sfx.createGain();
        o.connect(g); g.connect(sfx.destination);
        o.type = type;
        const t = sfx.currentTime + startOffset;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.start(t); o.stop(t + dur + 0.01);
    } catch(e) {}
}
const SFX = {
    throw  : () => { tone(220,0.08,'sawtooth',0.3); tone(160,0.1,'sawtooth',0.2,0.07); },
    score1 : () => { tone(523,0.12,'square',0.35); },
    score2 : () => { tone(523,0.1,'square',0.35); tone(659,0.12,'square',0.35,0.1); },
    score3 : () => { tone(523,0.1,'square',0.35); tone(659,0.1,'square',0.35,0.1); tone(784,0.15,'square',0.4,0.2); },
    miss   : () => { tone(300,0.08,'sawtooth',0.3); tone(200,0.1,'sawtooth',0.25,0.07); tone(130,0.15,'sawtooth',0.2,0.17); },
    bounce : () => tone(350,0.05,'sine',0.15),
    block  : () => tone(250,0.08,'sawtooth',0.2),
    special: () => {
        // Fanfare-Melodie
        [523,659,784,1047,784,1047,1319,1568,2093].forEach((f,i) => tone(f,0.12,'square',0.45,i*0.09));
    },
    tick   : () => tone(800,0.04,'square',0.1),
};

// ── Hilfsfunktionen ───────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
    // Eigene roundRect für Kompatibilität
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,          r);
    ctx.closePath();
}
function star(cx, cy, ro, ri, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
        const a = (i * Math.PI / pts) - Math.PI / 2;
        const r = (i % 2 === 0) ? ro : ri;
        i === 0 ? ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r)
                : ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    }
    ctx.closePath();
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Partikel ──────────────────────────────────────────────────
let particles = [];
function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 4;
        particles.push({
            x, y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 1.5,
            sz: 3 + Math.random() * 5,
            color,
            life: 1, decay: 0.022 + Math.random() * 0.02
        });
    }
}
function updateParticles() {
    particles = particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18;
        p.sz *= 0.96; p.life -= p.decay;
        return p.life > 0;
    });
}
function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// ── Score-Popups ──────────────────────────────────────────────
let popups = [];
function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.6, vy: -1.5 });
}
function updatePopups() {
    popups = popups.filter(p => { p.y += p.vy; p.life -= 0.02; return p.life > 0; });
}
function drawPopups() {
    popups.forEach(p => {
        const a = Math.min(1, p.life);
        ctx.globalAlpha = a;
        ctx.font = `bold 20px "Courier New"`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 4;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
}

// ── Eingabe ───────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','Enter'].includes(e.code)) {
        initAudio();
        if (state === S.INTRO)    { startGame(); return; }
        if (state === S.GAMEOVER) { restartGame(); return; }
    }
    if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', e => keys[e.code] = false);

// ── Ziel-Oszillation (automatisch schwingend) ─────────────────
// Statt Drag: Linie schwingt alleine, einmal Tippen/Klicken = Werfen
const AIM = {
    angle:    Math.PI / 4,  // aktueller Winkel (0 = horizontal rechts)
    angleMin: 0.32,         // ~18°  sehr flach
    angleMax: 1.20,         // ~69°  sehr steil
    dir:  1,
    speed: 0.022,           // Schwing-Geschwindigkeit pro Frame

    update() {
        if (state !== S.PLAYING || melon) return;
        this.angle += this.dir * this.speed;
        if (this.angle >= this.angleMax) { this.angle = this.angleMax; this.dir = -1; }
        if (this.angle <= this.angleMin) { this.angle = this.angleMin; this.dir =  1; }
    },

    // Physikformel: exakter Impuls damit der Bogen den Korb trifft
    getVelocity() {
        const originY = wolf.y - 32;
        const dx = basket.x - wolf.x;      // horizontale Distanz (immer positiv)
        const dy = originY - basket.y;     // Höhendifferenz (>0 wenn Korb über Abwurf)
        const g  = GRAVITY;
        const θ  = this.angle;
        const denom = 2 * Math.cos(θ) ** 2 * (dx * Math.tan(θ) - dy);
        let v = (denom > 0) ? Math.sqrt(g * dx * dx / denom) : 18;
        v = Math.max(7, Math.min(24, v));
        return { vx: v * Math.cos(θ), vy: -v * Math.sin(θ) };
    }
};

// In welchem Bereich wurde getippt? (für On-Screen-Buttons)
function tapArea(x, y) {
    if (y > H - 74) {
        if (x < W * 0.28)  return 'left';
        if (x > W * 0.72)  return 'right';
        return 'throw';
    }
    return 'throw'; // gesamte Spielfläche oben = Werfen
}

// Mobile-Button-Status (dauerhaft gedrückt)
const mobileKeys = { left: false, right: false };

function canvasXY(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (clientX - r.left) * (W / r.width),
        y: (clientY - r.top)  * (H / r.height)
    };
}

function fireMelon() {
    if (state !== S.PLAYING || melon || !wolf.holdingMelon) return;
    const vel = AIM.getVelocity();
    launchMelon(vel.vx, vel.vy);
}

// Maus-Events
canvas.addEventListener('mousedown', e => {
    initAudio();
    if (state === S.INTRO)    { startGame(); return; }
    if (state === S.GAMEOVER) { restartGame(); return; }
    const p = canvasXY(e.clientX, e.clientY);
    const area = tapArea(p.x, p.y);
    if (area === 'left')  { mobileKeys.left  = true; return; }
    if (area === 'right') { mobileKeys.right = true; return; }
    fireMelon();
});
canvas.addEventListener('mouseup', () => {
    mobileKeys.left = false; mobileKeys.right = false;
});

// Touch-Events (Multi-Touch: gleichzeitig bewegen UND werfen möglich)
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    initAudio();
    if (state === S.INTRO)    { startGame(); return; }
    if (state === S.GAMEOVER) { restartGame(); return; }
    Array.from(e.changedTouches).forEach(t => {
        const p = canvasXY(t.clientX, t.clientY);
        const area = tapArea(p.x, p.y);
        if      (area === 'left')  mobileKeys.left  = true;
        else if (area === 'right') mobileKeys.right = true;
        else fireMelon();
    });
}, { passive: false });
canvas.addEventListener('touchend', e => {
    e.preventDefault();
    mobileKeys.left = false; mobileKeys.right = false;
    Array.from(e.touches).forEach(t => {
        const p = canvasXY(t.clientX, t.clientY);
        const area = tapArea(p.x, p.y);
        if (area === 'left')  mobileKeys.left  = true;
        if (area === 'right') mobileKeys.right = true;
    });
}, { passive: false });
canvas.addEventListener('touchcancel', () => {
    mobileKeys.left = false; mobileKeys.right = false;
}, { passive: false });

// ── Wolf ──────────────────────────────────────────────────────
const wolf = {
    x: 130, y: 400,
    state: 'idle',   // idle | throwing | celebrating | disappointed
    timer: 0,
    holdingMelon: true,
    // Pulsierend für Atemeffekt
    breathe: 0,

    get zone() {
        const dist = basket.x - this.x;
        if (dist < 210) return { pts: 1, name: 'NAH',    color: '#FF6B6B' };
        if (dist < 390) return { pts: 2, name: 'NORMAL', color: '#FFD93D' };
        return              { pts: 3, name: 'WEIT',   color: '#6BCB77' };
    },

    update(dt) {
        this.timer++;
        this.breathe = Math.sin(this.timer * 0.05) * 2;

        // Bewegen mit Pfeiltasten / WASD / On-Screen-Buttons
        if (state === S.PLAYING && !melon) {
            const spd = 2.8 * dt * 60;
            if (keys.ArrowLeft  || keys.KeyA || mobileKeys.left)  this.x = Math.max(55,  this.x - spd);
            if (keys.ArrowRight || keys.KeyD || mobileKeys.right) this.x = Math.min(480, this.x + spd);
        }

        // Zustandsübergänge
        if (this.state === 'throwing'     && this.timer > 28) this.state = 'idle';
        if (this.state === 'celebrating'  && this.timer > 65) { this.state = 'idle'; this.holdingMelon = true; }
        if (this.state === 'disappointed' && this.timer > 80) { this.state = 'idle'; this.holdingMelon = true; }
    }
};

// ── Korb ──────────────────────────────────────────────────────
const basket = {
    x: 655, y: 230, baseX: 655,
    rimW: 54, dir: 1, spd: 0.65, range: 42,
    update(dt) {
        if (state === S.PLAYING) {
            this.x += this.dir * this.spd * dt * 60;
            if (this.x > this.baseX + this.range) this.dir = -1;
            if (this.x < this.baseX - this.range) this.dir =  1;
        }
    }
};

// ── Hase ──────────────────────────────────────────────────────
const bunny = {
    x: 520, y: 400, scale: 1.0,
    state: 'idle',   // idle | moving | taunting | giant_dance | annoyed
    timer: 0, moveTimer: 60, targetX: 520, facing: -1,
    danceFrame: 0,

    update(dt) {
        this.timer++;

        if (this.state === 'giant_dance') {
            // Scale schnell auf 3×
            if (this.scale < 3.0) this.scale = Math.min(3.0, this.scale + 0.08);
            this.danceFrame = Math.floor(this.timer / 7) % 8;
            this.x = W / 2 + 80; // Rechts der Schrift positioniert
            return;
        }

        // Nach Special → zurückskalieren
        if (this.scale > 1.0) this.scale = Math.max(1.0, this.scale - 0.06);

        // Taunt / Annoyed Zeitbegrenzung
        if ((this.state === 'taunting' || this.state === 'annoyed') && this.timer > 75) {
            this.state = 'idle';
        }
        if (this.state === 'idle' || this.state === 'moving') {
            this.moveTimer--;
            if (this.moveTimer <= 0) {
                // 30% Chance: direkt zum Wolf rennen (störend)
                this.targetX = Math.random() < 0.3
                    ? wolf.x + 85 + Math.random() * 40
                    : 200 + Math.random() * 430;
                this.targetX = Math.max(60, Math.min(730, this.targetX));
                this.moveTimer = 90 + Math.random() * 130;
            }
            const dx = this.targetX - this.x;
            if (Math.abs(dx) > 2) {
                this.x += Math.sign(dx) * 1.7 * dt * 60;
                this.facing = dx < 0 ? -1 : 1;
                this.state = 'moving';
            } else {
                this.state = 'idle';
            }
        }
    },

    taunt()  { this.state = 'taunting'; this.timer = 0; },
    annoyed(){ this.state = 'annoyed';  this.timer = 0; },
    startDance() {
        this.state = 'giant_dance';
        this.timer = 0; this.scale = 1.0;
        this.x = W / 2 + 80;
    }
};

// ── Melone (Projektil) ────────────────────────────────────────
let melon = null;
let melonTrail = [];
const GRAVITY = 0.42;

function launchMelon(vx, vy) {
    melon = {
        x: wolf.x + 8, y: wolf.y - 32,
        vx, vy,
        radius: 14,
        rot: 0, rotSpd: vx * 0.045,
        bounces: 0
    };
    melonTrail = [];
    wolf.state = 'throwing'; wolf.timer = 0;
    wolf.holdingMelon = false;
    SFX.throw();
}

// ── Kollisionserkennung Korb ──────────────────────────────────
function checkBasketScore() {
    if (!melon) return false;
    const rl = basket.x - basket.rimW / 2;
    const rr2= basket.x + basket.rimW / 2;
    const ry = basket.y;
    // Ball fliegt nach unten und kreuzt die Randlinie
    const prevY = melon.y - melon.vy;
    if (melon.vy > 0 && prevY < ry + 4 && melon.y >= ry - 4 &&
        melon.x > rl + melon.radius * 0.6 && melon.x < rr2 - melon.radius * 0.6) {
        return true;
    }
    // Randtreffer (Abprallen)
    const hitL = Math.abs(melon.x - rl)  < melon.radius + 4 && Math.abs(melon.y - ry) < melon.radius + 6;
    const hitR = Math.abs(melon.x - rr2) < melon.radius + 4 && Math.abs(melon.y - ry) < melon.radius + 6;
    if (hitL || hitR) {
        melon.vx = melon.vx * -0.5 + (hitL ? 1.2 : -1.2);
        melon.vy *= -0.55;
        SFX.bounce();
        burst(melon.x, melon.y, '#FF8800', 5);
    }
    return false;
}

function checkBunnyBlock() {
    if (!melon || bunny.state === 'giant_dance') return false;
    const bh = 55 * bunny.scale;
    return Math.hypot(melon.x - bunny.x, melon.y - (bunny.y - bh * 0.5)) < 26 * bunny.scale;
}

// ── Wertung ───────────────────────────────────────────────────
function onScore(pts) {
    combo++;
    const bonus = combo >= 3 ? Math.floor(combo / 3) : 0;
    const total = pts + bonus;
    score += total;

    wolf.state = 'celebrating'; wolf.timer = 0;
    bunny.annoyed();

    const label = bonus > 0 ? `+${total} COMBO!` : `+${total}`;
    addPopup(basket.x, basket.y - 40, label, wolf.zone.color);
    burst(basket.x, basket.y - 5, '#FFD700', 14);
    burst(basket.x, basket.y - 5, '#FF8800', 7);
    triggerShake(7, 10);

    // Sound je Punktzahl
    [SFX.score1, SFX.score2, SFX.score3][Math.min(pts, 3) - 1]?.();

    // Special auslösen wenn: Ziffer 6 oder 7 im Score ODER Quersumme = 13
    if (isSpecialScore(score) && !triggeredSpecials.has(score)) {
        triggeredSpecials.add(score);
        setTimeout(() => triggerSpecial(score), 400);
    }

    return total;
}

function onMiss() {
    combo = 0;
    wolf.state = 'disappointed'; wolf.timer = 0;
    bunny.taunt();
    SFX.miss();
    addPopup(melon ? melon.x : wolf.x, 340, 'DANEBEN!', '#FF4444');
}

// ── Special "67 Move" ─────────────────────────────────────────
const SPECIAL = {
    active: false, timer: 0, duration: 260, score: 0,
    titleText: '', subText: '',
    // Warteschlange für mehrere schnell aufeinander folgende Auslöser
    queue: [],

    start(sc) {
        if (this.active) {
            // Läuft noch → in Warteschlange
            if (!this.queue.includes(sc)) this.queue.push(sc);
            return;
        }
        const info = getSpecialInfo(sc);
        this.active    = true;
        this.timer     = 0;
        this.score     = sc;
        this.duration  = info.dur;
        this.titleText = info.title;
        this.subText   = info.sub;
        bunny.startDance();
        SFX.special();
        triggerShake(18, 22);
        state = S.SPECIAL;
        for (let i = 0; i < 40; i++)
            burst(W / 2, H / 2, `hsl(${Math.random()*360},100%,65%)`, 1);
    },

    update() {
        if (!this.active) return;
        this.timer++;
        if (this.timer >= this.duration) {
            this.active = false;
            bunny.state = 'idle'; bunny.scale = 1.0;
            bunny.x = 520; bunny.targetX = 520; bunny.timer = 0;
            state = S.PLAYING;
            // Nächsten aus Warteschlange starten
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                setTimeout(() => this.start(next), 200);
            }
        }
    }
};

function triggerSpecial(sc) { SPECIAL.start(sc); }

// ═══════════════════════════════════════════════════════════════
//  Z E I C H N E N
// ═══════════════════════════════════════════════════════════════

// ── Hintergrund ───────────────────────────────────────────────
function drawBackground() {
    // Himmel (Verlauf)
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.76);
    sky.addColorStop(0, '#1a0a40');
    sky.addColorStop(1, '#3d1075');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.76);

    // Dekorative "Sportpalast"-Schrift im Hintergrund
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ff88ff';
    ctx.font = 'bold 22px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText('*** SPORTPALAST RETRO ***', W / 2, 42);
    ctx.restore();

    // Retro-Sterne (Hintergrund)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < 5; i++) {
        star(80 + i * 155, 72, 18, 7, 5);
        ctx.fill();
    }
    ctx.restore();

    // Flackernde Sternchen (Retro-Partikel-Optik)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 28; i++) {
        const px = (i * 97 + 31) % W;
        const py = (i * 61 + 17) % (H * 0.55);
        const tw = Math.sin(frameCount * 0.04 + i * 1.1) * 0.5 + 0.5;
        ctx.globalAlpha = tw * 0.6;
        ctx.beginPath(); ctx.arc(px, py, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Parkettboden
    const floorY = Math.round(H * 0.77);
    ctx.fillStyle = '#C8722A'; ctx.fillRect(0, floorY, W, H - floorY);
    // Parkettstreifen
    ctx.strokeStyle = '#A05820'; ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.moveTo(0, floorY + i * 7); ctx.lineTo(W, floorY + i * 7);
        ctx.stroke();
    }

    // Zonenfärbung auf dem Boden
    const zh = H - floorY;
    // NAH-Zone (Rot)
    ctx.fillStyle = 'rgba(255,90,90,0.22)';
    ctx.fillRect(450, floorY, W - 450, zh);
    // NORMAL-Zone (Gelb)
    ctx.fillStyle = 'rgba(255,210,0,0.18)';
    ctx.fillRect(250, floorY, 200, zh);
    // WEIT-Zone (Grün)
    ctx.fillStyle = 'rgba(70,200,70,0.18)';
    ctx.fillRect(0, floorY, 250, zh);

    // Zonenlinien
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(250, floorY); ctx.lineTo(250, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(450, floorY); ctx.lineTo(450, H); ctx.stroke();
    ctx.setLineDash([]);

    // Zonenbeschriftungen
    ctx.font = 'bold 11px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100,220,100,0.9)'; ctx.fillText('+3 WEIT',   125, floorY + 16);
    ctx.fillStyle = 'rgba(255,210,50,0.9)';  ctx.fillText('+2 NORMAL', 350, floorY + 16);
    ctx.fillStyle = 'rgba(255,100,100,0.9)'; ctx.fillText('+1 NAH',    590, floorY + 16);

    // 3-Punkt-Bogen (gestrichelt)
    ctx.strokeStyle = 'rgba(200,180,100,0.25)'; ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(basket.x, floorY, 195, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke(); ctx.setLineDash([]);
}

// ── Korb ──────────────────────────────────────────────────────
function drawBasket() {
    const bx = basket.x, by = basket.y, rw = basket.rimW;

    // Stange
    ctx.fillStyle = '#777';
    ctx.fillRect(bx + rw/2 - 3, by + 18, 7, H - by - 18);

    // Rückbrett (Backboard)
    ctx.fillStyle = '#F8F8F0';
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx, bx + rw/2 - 5, by - 65, 14, 85, 2);
    ctx.fill(); ctx.stroke();
    // Rotes Quadrat auf dem Rückbrett
    ctx.strokeStyle = '#EE2222'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx, bx + rw/2 - 2, by - 33, 8, 22, 1);
    ctx.stroke();

    // Netz (Linien)
    ctx.strokeStyle = 'rgba(240,240,240,0.7)'; ctx.lineWidth = 1;
    const netH = 34;
    for (let c = 0; c <= 6; c++) {
        const tx = bx - rw/2 + (c/6) * rw;
        const bxn= bx + (c/6 - 0.5) * rw * 0.55;
        ctx.beginPath(); ctx.moveTo(tx, by); ctx.lineTo(bxn, by + netH); ctx.stroke();
    }
    for (let r = 1; r <= 4; r++) {
        const t = r / 4, ny = by + t * netH;
        const hw = (rw / 2) * (1 - 0.28 * t);
        ctx.beginPath(); ctx.moveTo(bx - hw, ny); ctx.lineTo(bx + hw, ny); ctx.stroke();
    }

    // Rand hinten (dunkler)
    ctx.strokeStyle = '#CC4400'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx - rw/2, by); ctx.lineTo(bx + rw/2, by); ctx.stroke();
    // Rand vorne (heller)
    ctx.strokeStyle = '#FF7700'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx - rw/2, by); ctx.lineTo(bx + rw/2, by); ctx.stroke();
    // Rand-Knöpfe
    ctx.fillStyle = '#FF9900';
    ctx.beginPath(); ctx.arc(bx - rw/2, by, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + rw/2, by, 5, 0, Math.PI*2); ctx.fill();
    ctx.lineCap = 'butt';
}

// ── Melone ────────────────────────────────────────────────────
function drawMelonShape(cx, cy, r, rot) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    // Grüne Füllung
    ctx.fillStyle = '#4CAF50'; ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Dunkle Streifen
    ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
        const a = (i/6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.arc(0,0,r-1,a-0.13,a+0.13);
        ctx.closePath(); ctx.stroke();
    }
    // Glanzpunkt
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(-r*0.28,-r*0.28,r*0.22,r*0.13,-0.5,0,Math.PI*2); ctx.fill();
    // Stiel
    ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0,-r); ctx.lineTo(2,-r-6); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.restore();
}

function drawMelon() {
    if (!melon) return;
    // Schweif
    melonTrail.forEach((p, i) => {
        const a = (i / melonTrail.length) * 0.35;
        const sz = melon.radius * 0.45 * (i / melonTrail.length);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawMelonShape(melon.x, melon.y, melon.radius, melon.rot);
}

// ── Zielvorschau (automatisch schwingender Wurfbogen) ─────────
function drawAimGuide() {
    if (!wolf.holdingMelon || melon || state !== S.PLAYING) return;

    const vel = AIM.getVelocity();
    let px = wolf.x + 8, py = wolf.y - 32;
    let pvx = vel.vx, pvy = vel.vy;

    // Prüfen ob Parabel nahe am Korb vorbeiläuft → Linie grün färben
    let nearBasket = false;
    let sx = px, sy = py, svx = pvx, svy = pvy;
    for (let i = 0; i < 120; i++) {
        sx += svx; sy += svy; svy += GRAVITY;
        if (Math.abs(sx - basket.x) < 38 && Math.abs(sy - basket.y) < 28) { nearBasket = true; break; }
        if (sy > H) break;
    }
    const lineColor = nearBasket ? 'rgba(80,255,100,0.85)' : 'rgba(255,220,50,0.60)';

    // Gestrichelte Wurfparabel
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(px, py);
    let lastX = px, lastY = py;
    for (let i = 0; i < 100; i++) {
        px += pvx; py += pvy; pvy += GRAVITY;
        if (py > H - 74 || px < 0 || px > W) break;
        ctx.lineTo(px, py);
        lastX = px; lastY = py;
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Kleiner Kreis am Endpunkt der Linie
    ctx.fillStyle = lineColor;
    ctx.beginPath(); ctx.arc(lastX, lastY, 5, 0, Math.PI * 2); ctx.fill();

    // "TIPPEN!" Hinweis nur in den ersten 8 Sekunden (hilft Einsteigern)
    if (frameCount < 480) {
        const pulse = Math.sin(frameCount * 0.14) * 0.5 + 0.5;
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 13px "Courier New"'; ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText('TIPPEN = WERFEN', wolf.x, wolf.y - 105);
        ctx.fillText('TIPPEN = WERFEN', wolf.x, wolf.y - 105);
        ctx.globalAlpha = 1;
    }
}

// ── On-Screen Buttons (Mobile) ────────────────────────────────
function drawMobileButtons() {
    const bh = 74, bw = Math.round(W * 0.28);
    const y0 = H - bh;

    const btn = (x, y, w, h, icon, label, active) => {
        ctx.fillStyle = active ? 'rgba(255,165,30,0.60)' : 'rgba(0,0,0,0.45)';
        ctx.beginPath(); rr(ctx, x+3, y+3, w-6, h-6, 10); ctx.fill();
        ctx.strokeStyle = active ? '#FFD700' : 'rgba(255,255,255,0.30)';
        ctx.lineWidth = active ? 2.5 : 1.5;
        ctx.beginPath(); rr(ctx, x+3, y+3, w-6, h-6, 10); ctx.stroke();
        ctx.fillStyle = active ? '#FFD700' : 'rgba(255,255,255,0.65)';
        ctx.font = 'bold 28px "Courier New"'; ctx.textAlign = 'center';
        ctx.fillText(icon, x + w/2, y + h/2 + 5);
        ctx.font = '10px "Courier New"';
        ctx.fillStyle = active ? '#FFD700' : 'rgba(255,255,255,0.45)';
        ctx.fillText(label, x + w/2, y + h/2 + 22);
    };

    btn(0,      y0, bw,      bh, '◀', 'LINKS',  mobileKeys.left);
    btn(W - bw, y0, bw,      bh, '▶', 'RECHTS', mobileKeys.right);

    // Mittlerer Werfen-Button
    const mw = W - bw * 2, mx = bw;
    const canFire = wolf.holdingMelon && !melon && state === S.PLAYING;
    ctx.fillStyle = canFire ? 'rgba(220,80,0,0.55)' : 'rgba(40,40,40,0.40)';
    ctx.beginPath(); rr(ctx, mx+3, y0+3, mw-6, bh-6, 10); ctx.fill();
    ctx.strokeStyle = canFire ? '#FF8800' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = canFire ? 2.5 : 1.5;
    ctx.beginPath(); rr(ctx, mx+3, y0+3, mw-6, bh-6, 10); ctx.stroke();
    ctx.fillStyle = canFire ? '#FFFFFF' : 'rgba(255,255,255,0.30)';
    ctx.font = 'bold 17px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillText('🍉  WERFEN', W/2, y0 + bh/2 + 4);
    ctx.font = '9px "Courier New"';
    ctx.fillStyle = canFire ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.20)';
    ctx.fillText('TIPPEN  oder  LEERTASTE', W/2, y0 + bh/2 + 19);
}

// ── Wolf zeichnen ─────────────────────────────────────────────
function drawWolf() {
    ctx.save();
    ctx.translate(wolf.x, wolf.y);

    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0,6,26,8,0,0,Math.PI*2); ctx.fill();

    const t = wolf.timer, b = wolf.breathe;

    if      (wolf.state === 'celebrating')  drawWolfCelebrate(t);
    else if (wolf.state === 'disappointed') drawWolfDisappoint(t);
    else                                    drawWolfIdle(t, b, wolf.state === 'throwing');

    ctx.restore();
}

// Gemeinsame Körper-Helfer
function wBody(ofx, b, col) {
    ctx.fillStyle = col || '#8C8C8C'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ofx, -28+b, 18, 23, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
}
function wHead(ofx, b, col) {
    ctx.fillStyle = col || '#9C9C9C'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ofx+2, -60+b, 16, 17, 0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
}
function wEars(ofx, b, wiggle) {
    const ew = wiggle * 0.3;
    ctx.fillStyle = '#7A7A7A'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    // Links
    ctx.beginPath(); ctx.moveTo(ofx-8,-72+b); ctx.lineTo(ofx-17+ew,-88+b); ctx.lineTo(ofx-2,-74+b); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Rechts
    ctx.beginPath(); ctx.moveTo(ofx+8,-72+b); ctx.lineTo(ofx+17-ew,-88+b); ctx.lineTo(ofx+2,-74+b); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Innen (rosa)
    ctx.fillStyle = '#CC8888'; ctx.strokeStyle = 'none';
    ctx.beginPath(); ctx.moveTo(ofx-7,-72+b); ctx.lineTo(ofx-14+ew,-84+b); ctx.lineTo(ofx-3,-74+b); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ofx+7,-72+b); ctx.lineTo(ofx+14-ew,-84+b); ctx.lineTo(ofx+3,-74+b); ctx.closePath(); ctx.fill();
}
function wMuzzle(ofx, b, openMouth) {
    // Schnauze
    ctx.fillStyle = '#C0C0C0'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(ofx+5,-56+b,9,7,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    // Nase
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.ellipse(ofx+7,-59+b,4.5,3,0.3,0,Math.PI*2); ctx.fill();
    // Augen (bernsteinfarben)
    ctx.fillStyle = '#FFB300';
    ctx.beginPath(); ctx.ellipse(ofx-2,-64+b,5,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ofx+9,-64+b,5,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(ofx-1,-64+b,2.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ofx+10,-64+b,2.5,0,Math.PI*2); ctx.fill();
    // Weißer Glanz
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(ofx,  -66+b,1.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ofx+11,-66+b,1.2,0,Math.PI*2); ctx.fill();
    // Grinsen
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    if (openMouth) {
        ctx.fillStyle = '#CC0000';
        ctx.beginPath(); ctx.arc(ofx+5,-49+b,6,0,Math.PI); ctx.fill();
        ctx.fillStyle = 'white'; ctx.fillRect(ofx+1,-51+b,3,3); ctx.fillRect(ofx+5,-51+b,3,3);
    } else {
        ctx.beginPath(); ctx.arc(ofx+5,-49+b,5,0.2,Math.PI-0.2); ctx.stroke();
        ctx.fillStyle = 'white'; ctx.fillRect(ofx+2,-51+b,2.5,3); ctx.fillRect(ofx+6,-51+b,2.5,3);
    }
}
function wLegs(ofx, b) {
    ctx.fillStyle = '#707070'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx,ofx-11,-7+b,10,20,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ofx-7, 15+b,8,4, 0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); rr(ctx,ofx+2, -7+b,10,20,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ofx+7, 15+b,8,4,-0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
}
function wTail(ofx, b, wag) {
    ctx.strokeStyle = '#7A7A7A'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ofx-14,-18+b);
    ctx.quadraticCurveTo(ofx-28,-34+wag*0.5, ofx-24+wag,-44+b); ctx.stroke();
    ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ofx-14,-18+b);
    ctx.quadraticCurveTo(ofx-26,-32+wag*0.4, ofx-22+wag,-42+b); ctx.stroke();
    ctx.lineCap = 'butt';
}
function wArm(ox, oy, angle, holdMelon) {
    ctx.save(); ctx.translate(ox, oy); ctx.rotate(angle);
    ctx.fillStyle = '#8C8C8C'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx,-4,0,8,24,3); ctx.fill(); ctx.stroke();
    // Pfote
    ctx.fillStyle = '#9C9C9C';
    ctx.beginPath(); ctx.arc(0,24,6,0,Math.PI*2); ctx.fill(); ctx.stroke();
    if (holdMelon) drawMelonShape(0,30,10,0);
    ctx.restore();
}

function drawWolfIdle(t, b, throwing) {
    const wag = Math.sin(t * 0.05) * 14;
    const swing = Math.sin(t * 0.04) * 0.12;
    wBody(0, b); wHead(0, b); wEars(0, b, wag);
    wMuzzle(0, b, throwing);
    if (throwing) {
        // Wurfarm nach vorne
        wArm(12,-38+b,-0.6+Math.sin(t*0.8)*0.25, false);
    } else {
        wArm(-12,-38+b, Math.PI*0.1+swing, false);
        wArm( 12,-38+b,-Math.PI*0.15-swing, !melon && wolf.holdingMelon);
    }
    wLegs(0, b); wTail(0, b, wag);
}

function drawWolfCelebrate(t) {
    const jump = Math.abs(Math.sin(t * 0.2)) * 16;
    ctx.translate(0, -jump);
    wBody(0, 0, '#6C6C6C'); wHead(0, 0, '#7C7C7C');
    // Ohren aufgestellt
    ctx.fillStyle = '#6A6A6A'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8,-72); ctx.lineTo(-17,-93); ctx.lineTo(-2,-74); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 8,-72); ctx.lineTo( 17,-93); ctx.lineTo( 2,-74); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Jubel-Augen (groß)
    ctx.fillStyle = '#FFB300';
    ctx.beginPath(); ctx.arc(-2,-64,6.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10,-64,6.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-2,-64,3.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10,-64,3.5,0,Math.PI*2); ctx.fill();
    // Breites Grinsen
    ctx.fillStyle = '#CC0000';
    ctx.beginPath(); ctx.arc(5,-50,9,0,Math.PI); ctx.fill();
    ctx.fillStyle = 'white'; ctx.fillRect(1,-52,3,4); ctx.fillRect(5,-52,3,4); ctx.fillRect(9,-52,3,4);
    // Arme hoch
    const wave = Math.sin(t * 0.3) * 0.3;
    wArm(-12,-40,-Math.PI*0.85+wave, false);
    wArm( 14,-40,-Math.PI*0.85-wave, false);
    wLegs(0,0);
    // Schweif wedelt schnell
    const wag = Math.sin(t * 0.15) * 18;
    wTail(0,0,wag);
}

function drawWolfDisappoint(t) {
    const slump = Math.min(t * 0.4, 8);
    ctx.translate(0, slump);
    wBody(0, 0); wHead(0, slump*0.3);
    // Hängende Ohren
    ctx.fillStyle = '#7A7A7A'; ctx.strokeStyle = '#404040'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8,-72); ctx.lineTo(-14,-80); ctx.lineTo(-3,-73); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 8,-72); ctx.lineTo( 14,-80); ctx.lineTo( 3,-73); ctx.closePath(); ctx.fill(); ctx.stroke();
    // X-Augen
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-5,-68); ctx.lineTo(-1,-63); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5,-63); ctx.lineTo(-1,-68); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 7,-68); ctx.lineTo(11,-63); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 7,-63); ctx.lineTo(11,-68); ctx.stroke();
    // Schmollmund
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(5,-46,5,Math.PI+0.3,-0.3); ctx.stroke();
    // Schweißtropfen
    ctx.fillStyle = '#88AAFF';
    ctx.beginPath(); ctx.arc(15,-60,3,0,Math.PI*2); ctx.fill();
    // Arme hängend
    wArm(-12,-38, Math.PI*0.15, false);
    wArm( 12,-38,-Math.PI*0.15, false);
    wLegs(0, 0);
    wTail(0, 0, -8);
}

// ── Hase zeichnen ─────────────────────────────────────────────
function drawBunny() {
    ctx.save();
    ctx.translate(bunny.x, bunny.y);
    ctx.scale(bunny.facing, 1);
    ctx.scale(bunny.scale, bunny.scale);

    // Schatten (wird mit dem Hasen skaliert – kleiner Trick)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 6/bunny.scale, 22/bunny.scale*bunny.scale, 7, 0, 0, Math.PI*2); ctx.fill();

    if (bunny.state === 'giant_dance') {
        drawBunnyDance(bunny.danceFrame, bunny.timer);
    } else if (bunny.state === 'taunting') {
        drawBunnyTaunt(bunny.timer);
    } else {
        const walking = bunny.state === 'moving';
        drawBunnyNormal(bunny.timer, walking, bunny.state === 'annoyed');
    }

    ctx.restore();
}

function bBody(b, col) {
    ctx.fillStyle = col || '#F0E0C0'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0,-24-b,16,21,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
}
function bHead(b, col) {
    ctx.fillStyle = col || '#F5E8C8'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(2,-54-b,15,15,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
}
function bEars(b, wg) {
    ctx.fillStyle = '#F5E8C8'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    // Linkes Ohr (lang!)
    ctx.beginPath();
    ctx.moveTo(-5,-63-b);
    ctx.bezierCurveTo(-9,-78-b, -8+wg,-100, -3+wg,-106-b);
    ctx.bezierCurveTo( 2+wg,-100,  2+wg,-78,  1,-63-b);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFAAAA';
    ctx.beginPath();
    ctx.moveTo(-4,-64-b);
    ctx.bezierCurveTo(-7,-77-b, -6+wg*0.7,-95, -2+wg*0.7,-100-b);
    ctx.bezierCurveTo( 1+wg*0.7,-95, 1+wg*0.7,-77, 0,-64-b);
    ctx.closePath(); ctx.fill();
    // Rechtes Ohr
    ctx.fillStyle = '#F5E8C8'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9,-63-b);
    ctx.bezierCurveTo(13,-78-b, 11-wg,-100,  7-wg,-106-b);
    ctx.bezierCurveTo( 3-wg,-100,  1-wg,-78,  3,-63-b);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFAAAA';
    ctx.beginPath();
    ctx.moveTo(8,-64-b);
    ctx.bezierCurveTo(11,-77-b,  9-wg*0.7,-95,  6-wg*0.7,-100-b);
    ctx.bezierCurveTo( 3-wg*0.7,-95, 2-wg*0.7,-77, 2,-64-b);
    ctx.closePath(); ctx.fill();
}
function bFace(b, mood) {
    // Schnauze
    ctx.fillStyle = '#FFF4E8'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(5,-50-b,8,6,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    // Nase
    ctx.fillStyle = '#FF88AA';
    ctx.beginPath(); ctx.ellipse(6,-52-b,3.5,2.5,0,0,Math.PI*2); ctx.fill();
    // Augen
    if (mood === 'laugh') {
        // Lachende Augen (geschlossen, Bogen)
        ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-4,-57-b,4.5,Math.PI+0.3,-0.3); ctx.stroke();
        ctx.beginPath(); ctx.arc( 8,-57-b,4.5,Math.PI+0.3,-0.3); ctx.stroke();
    } else {
        ctx.fillStyle = '#BB0000';
        ctx.beginPath(); ctx.arc(-4,-58-b,5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc( 8,-58-b,5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(-2,-60-b,2,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10,-60-b,2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-3,-60-b,1.5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc( 9,-60-b,1.5,0,Math.PI*2); ctx.fill();
    }
    // Mund je nach Stimmung
    ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 1.5;
    if (mood === 'smug' || mood === 'normal') {
        ctx.beginPath();
        ctx.moveTo(1,-46-b); ctx.quadraticCurveTo(5,-41-b,10,-46-b); ctx.stroke();
    }
    if (mood === 'laugh') {
        ctx.fillStyle = '#BB0000';
        ctx.beginPath(); ctx.arc(3,-46-b,7,0,Math.PI); ctx.fill();
        ctx.fillStyle = 'white'; ctx.fillRect(0,-48-b,3,3.5); ctx.fillRect(4,-48-b,3,3.5);
        // Lachranen
        ctx.fillStyle = '#88AAFF';
        ctx.beginPath(); ctx.arc(-8,-52-b,2.5,0,Math.PI*2); ctx.fill();
    }
    // Schneidezähne
    if (mood !== 'laugh') {
        ctx.fillStyle = 'white';
        ctx.fillRect(2,-47-b,3,3.5); ctx.fillRect(6,-47-b,3,3.5);
        ctx.strokeStyle = '#CCC'; ctx.lineWidth = 0.5;
        ctx.strokeRect(2,-47-b,3,3.5); ctx.strokeRect(6,-47-b,3,3.5);
    }
}
function bLimbs(b, walk, t) {
    // Schwanz (flauschig)
    ctx.fillStyle = 'white'; ctx.strokeStyle = '#DDD'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-16,-19-b,7.5,0,Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#F0E0C0'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    const ls = walk ? Math.sin(t*0.15)*7 : 0;
    // Linker Arm
    ctx.save(); ctx.translate(-14,-33-b); ctx.rotate(Math.PI*0.12+ls*0.02);
    ctx.beginPath(); rr(ctx,-4,0,8,20,3); ctx.fill(); ctx.stroke(); ctx.restore();
    // Rechter Arm
    ctx.save(); ctx.translate(14,-33-b); ctx.rotate(-Math.PI*0.12-ls*0.02);
    ctx.beginPath(); rr(ctx,-4,0,8,20,3); ctx.fill(); ctx.stroke(); ctx.restore();
    // Linkes Bein
    ctx.save(); ctx.translate(-7,-7-b); ctx.rotate(ls*0.05);
    ctx.beginPath(); rr(ctx,-5,0,10,18,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,21,8,4,0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Rechtes Bein
    ctx.save(); ctx.translate(7,-7-b); ctx.rotate(-ls*0.05);
    ctx.beginPath(); rr(ctx,-5,0,10,18,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,21,8,4,-0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
}

function drawBunnyNormal(t, walking, annoyed) {
    const b = walking ? Math.abs(Math.sin(t*0.14))*5 : Math.sin(t*0.04)*2;
    const ew = Math.sin(t*0.06)*5;
    bBody(b); bHead(b); bEars(b, ew);
    bFace(b, annoyed ? 'smug' : 'normal');
    bLimbs(b, walking, t);
    // Wenn genervt: Fragezeichen über dem Kopf
    if (annoyed) {
        ctx.fillStyle = '#FF6600'; ctx.font = 'bold 18px "Courier New"';
        ctx.textAlign = 'center'; ctx.fillText('!', 0, -115-b);
    }
}

function drawBunnyTaunt(t) {
    const bounce = Math.sin(t*0.28)*8;
    ctx.translate(0, bounce);
    bBody(0); bHead(0); bEars(0, Math.sin(t*0.1)*8);
    bFace(0, 'laugh');
    // Zeigefinger-Arm (in Richtung Wolf)
    ctx.fillStyle = '#F0E0C0'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(-14,-33); ctx.rotate(-Math.PI*0.6);
    ctx.beginPath(); rr(ctx,-4,0,8,28,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,32,4,6,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Bauch-Arm (lacht)
    ctx.save(); ctx.translate(14,-28); ctx.rotate(Math.PI*0.1);
    ctx.beginPath(); rr(ctx,-4,0,8,18,3); ctx.fill(); ctx.stroke(); ctx.restore();
    // Beine (normal)
    ctx.fillStyle = '#F0E0C0'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx,-7,-7,10,18,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); rr(ctx, 2,-7,10,18,3); ctx.fill(); ctx.stroke();
    // Schweif
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-16,-19,7.5,0,Math.PI*2); ctx.fill();
    // Sprechblase "HA HA!"
    ctx.fillStyle = 'rgba(255,255,240,0.95)'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); rr(ctx,18,-88,64,28,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#CC0000'; ctx.font = 'bold 13px "Courier New"';
    ctx.textAlign = 'center'; ctx.fillText('HA HA!', 50, -69);
    // Zäckchen der Sprechblase
    ctx.fillStyle = 'rgba(255,255,240,0.95)';
    ctx.beginPath(); ctx.moveTo(18,-68); ctx.lineTo(8,-52); ctx.lineTo(28,-66); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(18,-68); ctx.lineTo(8,-52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8,-52); ctx.lineTo(28,-66); ctx.stroke();
}

function drawBunnyDance(frame, t) {
    // Verrückter Siegestanz – der berühmte 67-Move!
    const kick = (frame % 4 < 2) ? -0.45 : 0.3;
    const armL = (frame % 8 < 4) ? -Math.PI*0.9 : Math.PI*0.1;
    const armR = (frame % 8 < 4) ? Math.PI*0.1 : -Math.PI*0.9;
    const jumpH = (frame % 2 === 0) ? 14 : 0;

    ctx.translate(0, -jumpH);

    bBody(0, '#FFFFF0');
    bHead(0, '#FFFFF8');
    // Drehende Ohren
    const earRot = (t * 0.18) % (Math.PI * 2);
    ctx.save(); ctx.translate(-5,-63);
    ctx.rotate(earRot);
    ctx.fillStyle = '#F5E8C8'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.bezierCurveTo(-4,-16,-4,-36,0,-41);
    ctx.bezierCurveTo( 4,-36, 4,-16,0,  0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFAAAA';
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.bezierCurveTo(-2.5,-13,-2.5,-32,0,-36);
    ctx.bezierCurveTo( 2.5,-32, 2.5,-13,0,  0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(9,-63);
    ctx.rotate(-earRot);
    ctx.fillStyle = '#F5E8C8'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.bezierCurveTo(-4,-16,-4,-36,0,-41);
    ctx.bezierCurveTo( 4,-36, 4,-16,0,  0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Riesige Sieger-Augen
    const eyeSz = 7 + Math.sin(t*0.2)*2;
    ctx.fillStyle = '#FF0000';
    ctx.beginPath(); ctx.arc(-5,-58,eyeSz,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 9,-58,eyeSz,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-1,-61,3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(13,-61,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-2,-61,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(12,-61,2,0,Math.PI*2); ctx.fill();

    // Mega-Grinsen
    ctx.fillStyle = '#FF0000';
    ctx.beginPath(); ctx.arc(3,-47,11,0,Math.PI); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillRect(-1,-51,3.5,5); ctx.fillRect(3.5,-51,3.5,5); ctx.fillRect(8,-51,3.5,5);

    // Tanz-Arme
    ctx.fillStyle = '#F0E0C0'; ctx.strokeStyle = '#7A5810'; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(-16,-36); ctx.rotate(armL);
    ctx.beginPath(); rr(ctx,-5,0,10,28,4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,30,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(18,-36); ctx.rotate(armR);
    ctx.beginPath(); rr(ctx,-5,0,10,28,4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,30,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Tanz-Beine
    ctx.save(); ctx.translate(-7,-5); ctx.rotate(kick);
    ctx.beginPath(); rr(ctx,-5,0,10,22,4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,25,9,5,kick*0.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(7,-5); ctx.rotate(-kick);
    ctx.beginPath(); rr(ctx,-5,0,10,22,4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,25,9,5,-kick*0.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Schweif
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-16,-18,8,0,Math.PI*2); ctx.fill();

    // Umlaufende Sternchen
    for (let i = 0; i < 9; i++) {
        const ang = (i/9)*Math.PI*2 + t*0.06;
        const rad = 85 + Math.sin(t*0.12+i)*18;
        ctx.save();
        ctx.translate(Math.cos(ang)*rad, Math.sin(ang)*rad - 38);
        ctx.rotate(t*0.1+i);
        ctx.fillStyle = `hsl(${(t*6+i*40)%360},100%,65%)`;
        star(0,0,11+Math.sin(t*0.15+i)*3,4,5); ctx.fill();
        ctx.restore();
    }
}

// ── HUD ───────────────────────────────────────────────────────
function drawHUD() {
    // Punkte
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); rr(ctx,8,8,158,52,9); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.beginPath(); rr(ctx,8,8,158,52,9); ctx.stroke();
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 13px "Courier New"'; ctx.textAlign = 'left';
    ctx.fillText('PUNKTE:', 18, 27);
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 24px "Courier New"';
    ctx.fillText(String(score).padStart(4,'0'), 88, 50);

    // Rekord
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); rr(ctx,8,66,158,28,7); ctx.fill();
    ctx.fillStyle = '#88CCFF'; ctx.font = '11px "Courier New"';
    ctx.fillText(`REKORD: ${String(highscore).padStart(4,'0')}`, 18, 84);

    // Timer
    const secs = Math.ceil(gameTime / 60);
    const timerCol = secs <= 10 ? '#FF4444' : '#FFD700';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); rr(ctx,W-118,8,110,52,9); ctx.fill();
    ctx.strokeStyle = timerCol; ctx.lineWidth = 2; ctx.beginPath(); rr(ctx,W-118,8,110,52,9); ctx.stroke();
    ctx.fillStyle = timerCol; ctx.font = 'bold 13px "Courier New"'; ctx.textAlign = 'right';
    ctx.fillText('ZEIT:', W-18, 27);
    ctx.font = 'bold 24px "Courier New"';
    ctx.fillText(`${secs}s`, W-18, 50);

    // Timer-Blinken unter 10s
    if (secs <= 10 && frameCount % 30 < 15) {
        ctx.fillStyle = 'rgba(255,50,50,0.15)'; ctx.fillRect(0,0,W,H);
    }

    // Combo
    if (combo >= 2) {
        const hue = (frameCount * 6) % 360;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); rr(ctx,W/2-72,8,144,36,9); ctx.fill();
        ctx.fillStyle = `hsl(${hue},100%,65%)`; ctx.font = 'bold 17px "Courier New"'; ctx.textAlign = 'center';
        ctx.fillText(`COMBO x${combo}!`, W/2, 32);
    }

    // Aktuelle Zone – oben links unter Rekord (Platz ohne Button-Überlappung)
    const z = wolf.zone;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); rr(ctx,8,98,138,26,7); ctx.fill();
    ctx.fillStyle = z.color; ctx.font = 'bold 11px "Courier New"'; ctx.textAlign = 'left';
    ctx.fillText(`ZONE: ${z.name}  +${z.pts}`, 18, 116);
}

// ── Special-Overlay ───────────────────────────────────────────
function drawSpecialOverlay() {
    if (!SPECIAL.active) return;
    const t = SPECIAL.timer, prog = t / SPECIAL.duration;

    // Farbiges Bildschirm-Flackern
    const flash = Math.sin(t*0.35)*0.18+0.16;
    ctx.fillStyle = `rgba(255,200,30,${flash})`; ctx.fillRect(0,0,W,H);

    // Roter Rahmen pulsiert
    const border = Math.sin(t*0.45)*0.5+0.5;
    ctx.strokeStyle = `rgba(255,30,30,${border})`; ctx.lineWidth = 12;
    ctx.strokeRect(6,6,W-12,H-12);

    // "67!" oder "76!" Text – groß, bunt, springend
    const tScale = prog < 0.14 ? prog/0.14*1.25 : prog < 0.2 ? lerp(1.25,1.0,(prog-0.14)/0.06) : 1.0;
    const tBounce = Math.sin(t*0.15)*9;
    const hue = (t*7)%360;

    ctx.save();
    ctx.translate(W*0.33, H/2 - 50 + tBounce);
    ctx.scale(tScale, tScale);
    ctx.font = 'bold 92px "Courier New"';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 10;
    ctx.strokeText(SPECIAL.titleText, 0, 0);
    ctx.fillStyle = `hsl(${hue},100%,62%)`;
    ctx.fillText(SPECIAL.titleText, 0, 0);
    ctx.restore();

    // Sub-Text (Auslösegrund) erscheint nach kurzer Pause
    if (t > 28) {
        const alpha = Math.min(1, (t-28)/18);
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 26px "Courier New"'; ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
        ctx.strokeText(SPECIAL.subText, W*0.33, H/2 + 48);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(SPECIAL.subText, W*0.33, H/2 + 48);
        ctx.globalAlpha = 1;
    }

    // Umlaufende Sterne auf der linken Seite
    for (let i = 0; i < 8; i++) {
        const a2 = (i/8)*Math.PI*2 + t*0.07;
        const r2 = 115 + Math.sin(t*0.09+i)*22;
        ctx.save();
        ctx.translate(W*0.33 + Math.cos(a2)*r2, H/2 - 20 + Math.sin(a2)*70);
        ctx.rotate(t*0.08+i);
        ctx.fillStyle = `hsl(${(t*8+i*45)%360},100%,68%)`;
        star(0,0, 11+Math.sin(t*0.18+i)*3, 4,5); ctx.fill();
        ctx.restore();
    }

    // Untertext (animiert ein-/ausblenden)
    if (prog > 0.85) {
        const fadeOut = Math.max(0, 1 - (prog-0.85)/0.15);
        ctx.globalAlpha = fadeOut;
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 18px "Courier New"'; ctx.textAlign = 'center';
        ctx.fillText('WEITER GEHT\'S!', W*0.33, H/2 + 90);
        ctx.globalAlpha = 1;
    }
}

// ── Intro-Bildschirm ──────────────────────────────────────────
function drawIntro() {
    const sky = ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#100830'); sky.addColorStop(1,'#3a1060');
    ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

    // Sternenhimmel
    ctx.fillStyle = 'white';
    for (let i = 0; i < 45; i++) {
        const sx = (i*97+31)%W, sy = (i*61+17)%(H*0.8);
        const tw = Math.sin(frameCount*0.04+i*1.1)*0.5+0.5;
        ctx.globalAlpha = tw*0.7;
        ctx.beginPath(); ctx.arc(sx,sy,1.3,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Titel-Box
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.beginPath(); rr(ctx,W/2-210,50,420,96,14); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.beginPath(); rr(ctx,W/2-210,50,420,96,14); ctx.stroke();

    const tb = Math.sin(frameCount*0.055)*5;
    ctx.font = 'bold 50px "Courier New"'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 5;
    ctx.strokeText('MELON', W/2-68, 110+tb);
    ctx.strokeText('MADNESS', W/2+62, 110+tb);
    ctx.fillStyle = '#FFD700';
    ctx.fillText('MELON', W/2-68, 110+tb);
    ctx.fillText('MADNESS', W/2+62, 110+tb);

    const h2 = (frameCount*4)%360;
    ctx.font = 'bold 17px "Courier New"';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText('★ 67 SPECIAL EDITION ★', W/2, 136);
    ctx.fillStyle = `hsl(${h2},100%,62%)`;
    ctx.fillText('★ 67 SPECIAL EDITION ★', W/2, 136);

    // Info-Box (Wertung / Special)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); rr(ctx,W/2-200,158,400,68,10); ctx.fill();
    ctx.font = '12px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillStyle = '#6BCB77'; ctx.fillText('+3 FERNWURF  |  +2 NORMAL  |  +1 NAH', W/2, 180);
    ctx.fillStyle = '#FF88FF'; ctx.font = 'bold 12px "Courier New"';
    ctx.fillText('⚡ BEI 67 ODER 76 PUNKTEN: SPEZIAL-MOVE! ⚡', W/2, 204);

    // Wolf und Hase im Intro
    ctx.save(); ctx.translate(W/2-120, H/2+48); drawWolfIdle(frameCount,0,false); ctx.restore();
    ctx.save(); ctx.translate(W/2+128, H/2+48); ctx.scale(-1,1); drawBunnyNormal(frameCount,false,false); ctx.restore();

    // Steuerungsbox (neue, einfache Bedienung)
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); rr(ctx,W/2-200,H-112,400,80,10); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.font = '12px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillText('STEUERUNG: ◀ ▶ BEWEGEN', W/2, H-92);
    ctx.fillStyle = '#FFD700';
    ctx.fillText('EINMAL TIPPEN = WERFEN', W/2, H-72);
    const blink = Math.sin(frameCount*0.08)*0.5+0.5;
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 15px "Courier New"';
    ctx.fillText('TIPPEN ODER LEERTASTE = START!', W/2, H-42);
    ctx.globalAlpha = 1;
}

// ── Game-Over-Bildschirm ──────────────────────────────────────
function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);

    ctx.font = 'bold 58px "Courier New"'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 5;
    ctx.strokeText('GAME OVER!', W/2, H/2-60);
    ctx.fillStyle = '#FF4444';
    ctx.fillText('GAME OVER!', W/2, H/2-60);

    ctx.font = 'bold 26px "Courier New"'; ctx.fillStyle = '#FFF';
    ctx.fillText(`PUNKTE: ${score}`, W/2, H/2);

    if (score >= highscore && score > 0) {
        const b2 = Math.sin(frameCount*0.1)*0.5+0.5;
        ctx.globalAlpha = b2;
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 20px "Courier New"';
        ctx.fillText('★ NEUER REKORD! ★', W/2, H/2+36);
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = '#88AAFF'; ctx.font = '18px "Courier New"';
        ctx.fillText(`REKORD: ${highscore}`, W/2, H/2+36);
    }

    const b3 = Math.sin(frameCount*0.09)*0.5+0.5;
    ctx.globalAlpha = b3;
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 15px "Courier New"';
    ctx.fillText('KLICKEN ODER ENTER = NOCHMAL!', W/2, H/2+80);
    ctx.globalAlpha = 1;

    // Trauriger Wolf links, lachender Hase rechts
    ctx.save(); ctx.translate(W/2-110, H/2+170); drawWolfDisappoint(frameCount); ctx.restore();
    ctx.save(); ctx.translate(W/2+110, H/2+170); ctx.scale(-1,1); drawBunnyTaunt(frameCount); ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  S P I E L  L O G I K
// ═══════════════════════════════════════════════════════════════

function startGame() {
    state          = S.PLAYING;
    score          = 0;
    combo          = 0;
    gameTime       = 90 * 60;
    melon          = null;
    melonTrail     = [];
    particles      = [];
    popups         = [];
    triggeredSpecials.clear();
    SPECIAL.active = false; SPECIAL.queue = [];
    wolf.x         = 130; wolf.state = 'idle'; wolf.holdingMelon = true; wolf.timer = 0;
    bunny.x        = 520; bunny.state = 'idle'; bunny.scale = 1.0; bunny.timer = 0;
    basket.x       = basket.baseX; basket.dir = 1;
}

function restartGame() { startGame(); }

function endGame() {
    state = S.GAMEOVER;
    if (score > highscore) {
        highscore = score;
        localStorage.setItem('mm67_hs', highscore);
    }
}

// ── Hauptschleife Update ──────────────────────────────────────
function update(dt) {
    frameCount++;

    // Bildschirmzittern
    if (shakeFrames > 0) {
        shakeX = (Math.random()-0.5)*shakePow*2;
        shakeY = (Math.random()-0.5)*shakePow*2;
        shakeFrames--; shakePow *= 0.88;
    } else { shakeX = 0; shakeY = 0; }

    updateParticles();
    updatePopups();

    if (state === S.INTRO || state === S.GAMEOVER) return;

    // Special-Animation
    if (state === S.SPECIAL) {
        SPECIAL.update(); bunny.update(dt); return;
    }

    // Timer
    gameTime -= dt * 60;
    if (gameTime <= 0) { gameTime = 0; endGame(); return; }
    // Ticking unter 10s
    if (gameTime <= 10*60 && Math.floor(gameTime) % 60 === 59) SFX.tick();

    wolf.update(dt);
    basket.update(dt);
    bunny.update(dt);
    AIM.update();

    // Melonen-Physik
    if (melon) {
        melonTrail.push({ x: melon.x, y: melon.y });
        if (melonTrail.length > 16) melonTrail.shift();

        melon.vy   += GRAVITY;
        melon.x    += melon.vx;
        melon.y    += melon.vy;
        melon.rot  += melon.rotSpd;

        // Korb-Treffer
        if (checkBasketScore()) {
            onScore(wolf.zone.pts);
            melon = null; melonTrail = [];
            return;
        }

        // Hasen-Block
        if (checkBunnyBlock()) {
            melon.vx *= -0.55; melon.vy *= -0.45;
            melon.vx += (Math.random()-0.5)*3;
            SFX.block();
            burst(bunny.x, bunny.y-30, '#FF88AA', 8);
            addPopup(bunny.x, bunny.y-55, 'GEBLOCKT!', '#FF88AA');
        }

        // Boden-Aufprall
        if (melon.y > H - 22) {
            if (melon.bounces < 2) {
                melon.vy *= -0.48; melon.vx *= 0.68; melon.bounces++;
                SFX.bounce();
                burst(melon.x, H-22, '#4CAF50', 5);
            } else {
                onMiss();
                burst(melon.x, H-22, '#4CAF50', 10);
                melon = null; melonTrail = [];
            }
        }

        // Außerhalb des Bildschirms
        if (melon && (melon.x < -60 || melon.x > W+60)) {
            onMiss(); melon = null; melonTrail = [];
        }
    }

    // Melone zurückgeben, wenn Wolf bereit
    if (!melon && !wolf.holdingMelon && wolf.state === 'idle') {
        wolf.holdingMelon = true;
    }
}

// ── Hauptschleife Draw ────────────────────────────────────────
function draw() {
    ctx.save();
    ctx.translate(shakeX, shakeY);

    if (state === S.INTRO) {
        drawIntro();
    } else if (state === S.GAMEOVER) {
        drawGameOver();
    } else {
        drawBackground();
        drawBasket();
        drawMelon();
        drawAimGuide();
        drawBunny();
        drawWolf();
        drawParticles();
        drawPopups();
        drawHUD();
        drawMobileButtons();
        if (state === S.SPECIAL) drawSpecialOverlay();
    }

    ctx.restore();
}

// ── Game Loop ─────────────────────────────────────────────────
let lastTS = 0;
function loop(ts) {
    const dt = Math.min((ts - lastTS) / 1000, 0.05);
    lastTS = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
