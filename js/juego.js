(function () {
  "use strict";

  // ---------- Configuración ----------
  const NUM_COLUMNAS = 4;
  const MAX_CARTAS_POR_COLUMNA = 8;
  const VALORES_INICIALES = [2, 4, 8, 16, 32];
  const PESOS_VALORES = [50, 25, 15, 7, 3];
  const OBJETIVO = 2048;
  const CLAVE_MEJOR = "solitario2048_mejor";
  const CLAVE_ESTADO = "solitario2048_estado";
  const CLAVE_SONIDO = "solitario2048_sonido";
  const DELAY_FUSION = 180;

  // ---------- Estado ----------
  let columnas = [];
  let puntos = 0;
  let mejor = 0;
  let cartaActual = null;
  let juegoTerminado = false;
  // Animaciones por columna: cada columna se anima de forma independiente
  // para no bloquear al resto del tablero.
  const animandoCol = new Set();
  let ultimaCartaMazo = null;

  // ---------- Elementos DOM ----------
  const zonaJuego = document.getElementById("zonaJuego");
  const puntosEl = document.getElementById("puntos");
  const mejorEl = document.getElementById("mejor");
  const cartaActualEl = document.getElementById("cartaActual");
  const botonReiniciar = document.getElementById("botonReiniciar");
  const modal = document.getElementById("modalFin");
  const modalTitulo = document.getElementById("modalTitulo");
  const modalMensaje = document.getElementById("modalMensaje");
  const modalPuntos = document.getElementById("modalPuntos");
  const botonModalReiniciar = document.getElementById("botonModalReiniciar");
  const botonSonido = document.getElementById("botonSonido");

  // ---------- Audio ----------
  let audioCtx = null;
  let sonidoActivo = true;
  try {
    const guardado = localStorage.getItem(CLAVE_SONIDO);
    if (guardado === "0") sonidoActivo = false;
  } catch (_) {}

  function actualizarBotonSonido() {
    if (!botonSonido) return;
    if (sonidoActivo) {
      botonSonido.textContent = "🔊 Sonido";
      botonSonido.classList.remove("silenciado");
      botonSonido.setAttribute("aria-pressed", "true");
    } else {
      botonSonido.textContent = "🔇 Silencio";
      botonSonido.classList.add("silenciado");
      botonSonido.setAttribute("aria-pressed", "false");
    }
  }

  function alternarSonido() {
    sonidoActivo = !sonidoActivo;
    try { localStorage.setItem(CLAVE_SONIDO, sonidoActivo ? "1" : "0"); } catch (_) {}
    actualizarBotonSonido();
    if (sonidoActivo) reproducirFusion(4); // feedback breve al activar
  }

  function asegurarAudio() {
    if (audioCtx) return audioCtx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    } catch (_) { audioCtx = null; }
    return audioCtx;
  }

  // Toca una nota "chiptune" corta (base para el efecto arcade de fusión).
  function tocarNotaChip(ctx, freq, tiempo, dur, tipo, volumen) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo || "square";
    osc.frequency.setValueAtTime(freq, tiempo);
    // Pequeño pitch bend hacia arriba: sensación de "power-up"
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, tiempo + dur * 0.9);

    const vol = volumen == null ? 0.14 : volumen;
    gain.gain.setValueAtTime(0.0001, tiempo);
    gain.gain.exponentialRampToValueAtTime(vol, tiempo + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, tiempo + dur);

    // Pasa-bajos suave para redondear el square wave (no estridente)
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 2600;

    osc.connect(filtro);
    filtro.connect(gain);
    gain.connect(ctx.destination);
    osc.start(tiempo);
    osc.stop(tiempo + dur + 0.02);
  }

  // Efecto de fusión estilo arcade: arpegio ascendente rápido de 3 notas
  // (tipo "coin/power-up" retro). El tono base sube con cada fusión mayor.
  function reproducirFusion(valor) {
    if (!sonidoActivo) return;
    const ctx = asegurarAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (_) {} }

    // Escala pentatónica mayor (siempre suena agradable, nunca chocante)
    const escala = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 987.77];
    const idx = Math.max(0, Math.min(escala.length - 3, Math.log2(valor || 2) - 1));
    const base = escala[Math.floor(idx)];

    const ahora = ctx.currentTime;
    const paso = 0.06; // ~60ms entre notas => arpegio rápido y punchy

    // Arpegio: fundamental, tercera pentatónica, quinta (3 pasos hacia arriba)
    tocarNotaChip(ctx, base,              ahora,             0.11, "square",   0.13);
    tocarNotaChip(ctx, escala[Math.floor(idx) + 1], ahora + paso,      0.11, "square",   0.13);
    tocarNotaChip(ctx, escala[Math.floor(idx) + 2], ahora + paso * 2,  0.18, "triangle", 0.16);

    // "Click" corto de percusión: da esa sensación gamificada de impacto
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = "square";
    clickOsc.frequency.setValueAtTime(160, ahora);
    clickOsc.frequency.exponentialRampToValueAtTime(60, ahora + 0.06);
    clickGain.gain.setValueAtTime(0.12, ahora);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.07);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(ahora);
    clickOsc.stop(ahora + 0.08);
  }

  // ---------- Utilidades ----------
  function generarCartaAleatoria() {
    const total = PESOS_VALORES.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < VALORES_INICIALES.length; i++) {
      r -= PESOS_VALORES[i];
      if (r <= 0) return VALORES_INICIALES[i];
    }
    return VALORES_INICIALES[0];
  }

  function cargarMejor() {
    try {
      const v = parseInt(localStorage.getItem(CLAVE_MEJOR) || "0", 10);
      mejor = isNaN(v) ? 0 : v;
    } catch (_) { mejor = 0; }
  }

  function guardarMejor() {
    try { localStorage.setItem(CLAVE_MEJOR, String(mejor)); } catch (_) {}
  }

  function guardarEstado() {
    try {
      const estado = { columnas, puntos, cartaActual, juegoTerminado };
      localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado));
    } catch (_) {}
  }

  function cargarEstado() {
    try {
      const raw = localStorage.getItem(CLAVE_ESTADO);
      if (!raw) return false;
      const estado = JSON.parse(raw);
      if (!estado || !Array.isArray(estado.columnas) || estado.columnas.length !== NUM_COLUMNAS) return false;
      columnas = estado.columnas.map((c) => Array.isArray(c) ? c.slice() : []);
      puntos = typeof estado.puntos === "number" ? estado.puntos : 0;
      cartaActual = typeof estado.cartaActual === "number" ? estado.cartaActual : generarCartaAleatoria();
      juegoTerminado = !!estado.juegoTerminado;
      return true;
    } catch (_) { return false; }
  }

  function limpiarEstado() {
    try { localStorage.removeItem(CLAVE_ESTADO); } catch (_) {}
  }

  // ---------- Render ----------
  // columnaAnimar: índice de columna que recibió una carta; solo esa se re-anima.
  function renderColumnas(columnaAnimar) {
    zonaJuego.innerHTML = "";
    for (let i = 0; i < NUM_COLUMNAS; i++) {
      zonaJuego.appendChild(construirColumna(i, i === columnaAnimar));
    }
  }

  // Construye el nodo DOM de una sola columna.
  function construirColumna(i, animarEntrada) {
    const col = document.createElement("div");
    col.className = "columna";
    col.dataset.indice = String(i);
    if (columnas[i].length >= MAX_CARTAS_POR_COLUMNA - 1) col.classList.add("peligro");

    const flecha = document.createElement("span");
    flecha.className = "flecha-caida";
    flecha.textContent = "↓";
    col.appendChild(flecha);

    const etiqueta = document.createElement("span");
    etiqueta.className = "columna-indice";
    etiqueta.textContent = columnas[i].length + "/" + MAX_CARTAS_POR_COLUMNA;
    col.appendChild(etiqueta);

    for (let j = columnas[i].length - 1; j >= 0; j--) {
      const valor = columnas[i][j];
      const carta = document.createElement("div");
      carta.className = "carta";
      carta.dataset.valor = String(valor);
      carta.textContent = valor;
      if (animarEntrada) {
        if (j === columnas[i].length - 1) carta.classList.add("nueva");
        else carta.classList.add("desliza");
      }
      col.appendChild(carta);
    }

    col.addEventListener("click", function () { soltarCartaEnColumna(i); });
    return col;
  }

  // Reemplaza SOLO la columna i sin re-renderizar el resto (así no
  // interrumpimos animaciones que estén ocurriendo en otras columnas).
  function renderColumnaSolo(i, animarEntrada) {
    const nueva = construirColumna(i, animarEntrada);
    const actual = zonaJuego.children[i];
    if (actual) zonaJuego.replaceChild(nueva, actual);
    else zonaJuego.appendChild(nueva);
  }

  function renderMazo() {
    if (cartaActual == null) {
      cartaActualEl.textContent = "-";
      cartaActualEl.removeAttribute("data-valor");
    } else {
      cartaActualEl.textContent = String(cartaActual);
      cartaActualEl.dataset.valor = String(cartaActual);
    }
    // Animar el mazo cuando la próxima carta cambia (feedback visual).
    if (cartaActual !== ultimaCartaMazo) {
      cartaActualEl.classList.remove("cambio");
      // reflow para reiniciar la animación
      void cartaActualEl.offsetWidth;
      cartaActualEl.classList.add("cambio");
      ultimaCartaMazo = cartaActual;
    }
  }

  function renderMarcadores() {
    puntosEl.textContent = String(puntos);
    mejorEl.textContent = String(mejor);
  }

  // ---------- Feedback columna llena ----------
  function mostrarColumnaLlena(indice) {
    const col = zonaJuego.children[indice];
    if (col) {
      col.classList.remove("shake");
      void col.offsetWidth;
      col.classList.add("shake");
      setTimeout(function () { col.classList.remove("shake"); }, 1400);
    }
    // Toast centrado en pantalla (no dentro de la columna).
    const previo = document.querySelector(".toast-llena");
    if (previo) previo.remove();
    const toast = document.createElement("div");
    toast.className = "toast-llena";
    toast.textContent = "¡Columna llena!";
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 1400);
  }

  // ---------- Lógica principal ----------
  function soltarCartaEnColumna(indice) {
    if (juegoTerminado || cartaActual == null) return;
    // Bloquear SOLO esta columna si ya se está animando aquí.
    if (animandoCol.has(indice)) return;

    const columna = columnas[indice];
    if (columna.length >= MAX_CARTAS_POR_COLUMNA) {
      mostrarColumnaLlena(indice);
      return;
    }

    // Colocar la nueva carta (aún sin fusionar) y consumir del mazo.
    columna.push(cartaActual);
    cartaActual = generarCartaAleatoria();

    renderColumnaSolo(indice, true);
    renderMazo();
    guardarEstado();

    animandoCol.add(indice);
    // Esperar a que termine la animación de entrada antes de fusionar.
    setTimeout(function () {
      animarFusiones(indice, function () {
        animandoCol.delete(indice);
        if (puntos > mejor) { mejor = puntos; guardarMejor(); }
        renderMarcadores();
        guardarEstado();
        if (verificarDerrota()) terminarJuego(false);
      });
    }, 170);
  }

  // Fusiona paso a paso, animando cada choque + resultado.
  function animarFusiones(indice, cb) {
    const columna = columnas[indice];
    if (columna.length < 2 || columna[columna.length - 1] !== columna[columna.length - 2]) {
      cb();
      return;
    }

    const colEl = zonaJuego.children[indice];
    const cartas = colEl.querySelectorAll(".carta");
    const topEl = cartas[0];      // carta recién llegada (top array)
    const nextEl = cartas[1];     // segunda más nueva

    if (topEl) topEl.classList.add("fusion-caer");
    if (nextEl) nextEl.classList.add("fusion-recibir");

    setTimeout(function () {
      const valor = columna.pop();
      columna.pop();
      const fusionado = valor * 2;
      puntos += fusionado;

      if (fusionado >= OBJETIVO) {
        // 1) Completar la suma visualmente: la carta 2048 aparece en la cima
        //    como una fusión normal (con su brillito de resultado).
        columna.push(fusionado);
        renderColumnaSolo(indice, false);
        renderMarcadores();
        reproducirFusion(fusionado);
        const colTras = zonaJuego.children[indice];
        const cartasTras = colTras ? colTras.querySelectorAll(".carta") : [];
        if (cartasTras[0]) cartasTras[0].classList.add("fusion-resultado");

        // 2) Tras un beat, disparar la celebración + ola de limpieza que
        //    barre la columna de arriba a abajo mientras borra las cartas.
        setTimeout(function () {
          celebrar2048(indice);
          olaLimpieza(indice, function () {
            columnas[indice] = [];
            renderColumnaSolo(indice, false);
            cb();
          });
        }, 380);
        return;
      }

      columna.push(fusionado);
      renderColumnaSolo(indice, false);
      renderMarcadores();
      reproducirFusion(fusionado);

      // Resaltar la carta resultante en la cima.
      const colDespues = zonaJuego.children[indice];
      const cartasDespues = colDespues ? colDespues.querySelectorAll(".carta") : [];
      if (cartasDespues[0]) cartasDespues[0].classList.add("fusion-resultado");

      setTimeout(function () { animarFusiones(indice, cb); }, DELAY_FUSION);
    }, DELAY_FUSION);
  }

  function verificarDerrota() {
    // El juego termina cuando AL MENOS UNA columna se desborda (se llena).
    for (let i = 0; i < NUM_COLUMNAS; i++) {
      if (columnas[i].length >= MAX_CARTAS_POR_COLUMNA) return true;
    }
    return false;
  }

  // Barrido de brillo por cada carta de la columna, de arriba (más nueva)
  // hacia abajo. No bloquea: cuando termina la última, invoca cb().
  function olaLimpieza(indice, cb) {
    const colEl = zonaJuego.children[indice];
    if (!colEl) { cb(); return; }
    const cartas = colEl.querySelectorAll(".carta");
    if (!cartas.length) { cb(); return; }
    const paso = 70;
    const duracion = 380;
    cartas.forEach(function (c, i) {
      setTimeout(function () { c.classList.add("ola-limpieza"); }, i * paso);
    });
    setTimeout(cb, cartas.length * paso + duracion);
  }

  // Fanfarria arcade + flash + partículas al alcanzar 2048.
  function celebrar2048(indice) {
    // --- Sonido: arpegio ascendente largo + brillito agudo ---
    if (sonidoActivo) {
      const ctx = asegurarAudio();
      if (ctx) {
        if (ctx.state === "suspended") { try { ctx.resume(); } catch (_) {} }
        const ahora = ctx.currentTime;
        const notas = [523.25, 659.25, 783.99, 987.77, 1318.51, 1567.98];
        notas.forEach(function (f, i) {
          tocarNotaChip(ctx, f, ahora + i * 0.07, 0.16, "square", 0.14);
        });
        // Brillito agudo final tipo "sparkle"
        tocarNotaChip(ctx, 2093.00, ahora + notas.length * 0.07, 0.35, "triangle", 0.12);
        tocarNotaChip(ctx, 2637.02, ahora + notas.length * 0.07 + 0.05, 0.35, "triangle", 0.10);
      }
    }

    // --- Visual: flash de columna + carta 2048 gigante + partículas ---
    const colEl = zonaJuego.children[indice];
    if (!colEl) return;
    colEl.classList.add("columna-2048");

    // Carta 2048 flotante al centro de la columna
    const cartaCentral = document.createElement("div");
    cartaCentral.className = "carta-2048-burst";
    cartaCentral.textContent = "2048";
    colEl.appendChild(cartaCentral);

    // Partículas / chispas
    for (let k = 0; k < 14; k++) {
      const chispa = document.createElement("span");
      chispa.className = "chispa-2048";
      const ang = (Math.PI * 2 * k) / 14;
      const dist = 90 + Math.random() * 60;
      chispa.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      chispa.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      chispa.style.animationDelay = (Math.random() * 0.1) + "s";
      colEl.appendChild(chispa);
    }

    // Flash del marcador de puntos
    puntosEl.animate(
      [
        { transform: "scale(1)", color: "#fef4ea" },
        { transform: "scale(1.8)", color: "#c4d768" },
        { transform: "scale(1)", color: "#fef4ea" }
      ],
      { duration: 800 }
    );

    // Limpieza automática (el re-render de la columna las removerá igual)
    setTimeout(function () {
      colEl.classList.remove("columna-2048");
    }, 900);
  }

  function terminarJuego(gano) {
    juegoTerminado = true;
    modalTitulo.textContent = gano ? "🏆 ¡Victoria épica!" : "💥 ¡Se acabó!";
    modalMensaje.textContent = gano
      ? "¡Alcanzaste la mítica 2048! Eres una leyenda arcade."
      : "Tu columna se desbordó. ¿Otra ronda?";
    modalPuntos.textContent = String(puntos);
    modal.classList.remove("oculto");
    guardarEstado();
  }

  function reiniciar() {
    columnas = [];
    for (let i = 0; i < NUM_COLUMNAS; i++) columnas.push([]);
    puntos = 0;
    cartaActual = generarCartaAleatoria();
    juegoTerminado = false;
    animandoCol.clear();
    ultimaCartaMazo = null;
    modal.classList.add("oculto");
    limpiarEstado();
    renderColumnas();
    renderMazo();
    renderMarcadores();
    guardarEstado();
  }

  // ---------- Inicialización ----------
  botonReiniciar.addEventListener("click", reiniciar);
  botonModalReiniciar.addEventListener("click", reiniciar);
  if (botonSonido) botonSonido.addEventListener("click", alternarSonido);
  actualizarBotonSonido();

  cargarMejor();

  if (cargarEstado()) {
    renderColumnas();
    renderMazo();
    renderMarcadores();
    if (juegoTerminado) terminarJuego(false);
  } else {
    reiniciar();
  }
})();
