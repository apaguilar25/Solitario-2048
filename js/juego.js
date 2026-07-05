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
  const DELAY_FUSION = 380;

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
    }, 300);
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
        columnas[indice] = [];
        renderColumnaSolo(indice, false);
        renderMarcadores();
        anunciar2048();
        // Pequeña pausa para saborear el 2048.
        setTimeout(cb, 600);
        return;
      }

      columna.push(fusionado);
      renderColumnaSolo(indice, false);
      renderMarcadores();

      // Resaltar la carta resultante en la cima.
      const colDespues = zonaJuego.children[indice];
      const cartasDespues = colDespues ? colDespues.querySelectorAll(".carta") : [];
      if (cartasDespues[0]) cartasDespues[0].classList.add("fusion-resultado");

      setTimeout(function () { animarFusiones(indice, cb); }, DELAY_FUSION);
    }, DELAY_FUSION);
  }

  function verificarDerrota() {
    for (let i = 0; i < NUM_COLUMNAS; i++) {
      if (columnas[i].length >= MAX_CARTAS_POR_COLUMNA) {
        return true; 
      }
    }
    return false; 
  }

  function anunciar2048() {
    puntosEl.animate(
      [
        { transform: "scale(1)", color: "#fef4ea" },
        { transform: "scale(1.6)", color: "#c4d768" },
        { transform: "scale(1)", color: "#fef4ea" }
      ],
      { duration: 600 }
    );
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
