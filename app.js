// App principal (estado global)
let stream = null;                 // MediaStream actual de la cámara
let currentFacing = 'environment'; // Cámara activa: "user" (frontal) o "environment" (trasera)
let mediaRecorder = null;          // Instancia de MediaRecorder para audio
let chunks = [];                   // Buffers temporales de audio grabado
let beforeInstallEvent = null;     // Evento diferido para mostrar el prompt de instalación

// Accesos rápidos al DOM
const $ = (sel) => document.querySelector(sel);
const video = $('#video');                 // <video> donde se muestra el stream
const canvas = $('#canvas');               // <canvas> para capturar fotos
const photos = $('#photos');               // Contenedor de fotos capturadas
const audios = $('#audios');               // Contenedor de audios grabados

const btnStartCam = $('#btnStartCam');     // Botón iniciar cámara
const btnStopCam = $('#btnStopCam');       // Botón detener cámara
const btnFlip = $('#btnFlip');             // Botón alternar cámara
const btnTorch = $('#btnTorch');           // Botón linterna (si es que está soportada)
const btnShot = $('#btnShot');             // Botón tomar foto
const videoDevices = $('#videoDevices');   // <select> con las cámaras disponibles
const btnStartRec = $('#btnStartRec');     // Botón iniciar grabación de audio
const btnStopRec = $('#btnStopRec');       // Botón detener grabación de audio
const recStatus = $('#recStatus');         // Indicador de estado de grabación
const btnInstall = $('#btnInstall');       // Botón para instalar la PWA

// Instalación PWA (A2HS)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                      // Evita que el navegador muestre el prompt por defecto
  beforeInstallEvent = e;                  // Guardamos el evento para lanzarlo manualmente
  btnInstall.hidden = false;               // Mostramos el botón "Instalar"
});

btnInstall.addEventListener('click', async () => {
  if (!beforeInstallEvent) return;         // Si no hay evento almacenado, no hacemos nada
  beforeInstallEvent.prompt();             // Dispara el diálogo de instalación
  await beforeInstallEvent.userChoice;     // Espera la elección del usuario
  btnInstall.hidden = true;                // Oculta el botón tras la decisión
  beforeInstallEvent = null;               // Limpia la referencia
});

// Cámara: listado y control
async function listVideoInputs() {
  try {
    // Pide al navegador todos los dispositivos multimedia
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Filtra solo entradas de video
    const cams = devices.filter(d => d.kind === 'videoinput');

    // Vacía el <select> y lo rellena con las cámaras detectadas
    videoDevices.innerHTML = '';
    cams.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;                                   // deviceId que usaremos en getUserMedia
      opt.textContent = d.label || `Cámara ${i+1}`;             // Nombre legible (requiere permiso para verse)
      videoDevices.appendChild(opt);
    });
  } catch (err) {
    console.warn('No se pudo enumerar dispositivos:', err);
  }
}

async function startCam(constraints = {}) {
  // Verifica soporte de MediaDevices (HTTPS/localhost + navegador compatible)
  if (!('mediaDevices' in navigator)) {
    alert('Este navegador no soporta acceso a cámara/micrófono.');
    return;
  }
  try {
    // Solicita stream de video (más cualquier constraint extra recibido)
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacing, ...constraints },
      audio: false
    });

    // Enlaza el stream al <video> para previsualizar
    video.srcObject = stream;

    // Habilita controles relacionados
    btnStopCam.disabled = false;
    btnShot.disabled = false;
    btnFlip.disabled = false;
    btnTorch.disabled = false;

    // Actualiza el listado de cámaras disponibles
    await listVideoInputs();
  } catch (err) {
    alert('No se pudo iniciar la cámara: ' + err.message);
    console.error(err);
  }
}

function stopCam() {
  // Detiene todas las pistas del stream activo (libera la cámara)
  if (stream) { stream.getTracks().forEach(t => t.stop()); }
  stream = null;
  video.srcObject = null;

  // Deshabilita controles de cámara
  btnStopCam.disabled = true;
  btnShot.disabled = true;
  btnFlip.disabled = true;
  btnTorch.disabled = true;
}

// Botones de control de cámara
btnStartCam.addEventListener('click', () => startCam());
btnStopCam.addEventListener('click', stopCam);

btnFlip.addEventListener('click', async () => {
  // Alterna entre cámara frontal/trasera y reinicia el stream
  currentFacing = (currentFacing === 'environment') ? 'user' : 'environment';
  stopCam();
  await startCam();
});

videoDevices.addEventListener('change', async (e) => {
  // Cambia a un deviceId específico elegido en el <select>
  const id = e.target.value;
  stopCam();
  await startCam({ deviceId: { exact: id } });
});

btnTorch.addEventListener('click', async () => {
  try {
    // Algunas plataformas permiten activar la linterna con applyConstraints
    const [track] = stream ? stream.getVideoTracks() : [];
    if (!track) return;
    const caps = track.getCapabilities();
    // Alterna el estado del torch de forma simple (naive toggle)
    const torch = !(cts.advanced && cts.advanced[0]?.torch);
    await track.applyConstraints({ advanced: [{ torch }] });
  } catch (err) {
    alert('La linterna no es compatible en este dispositivo/navegador.');
  }
});

btnShot.addEventListener('click', () => {
  // Captura un frame del <video> y lo descarga como PNG
  if (!stream) return;

  // Ajusto el canvas al tamaño real del video
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  // Dibuja el frame actual en el canvas
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  // Exporta el contenido del canvas a Blob y lo muestra/descarga
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);

    // Enlace de descarga
    const a = document.createElement('a');
    a.href = url;
    a.download = `foto-${Date.now()}.png`;
    a.textContent = 'Descargar foto';
    a.className = 'btn';

    // Miniatura
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'captura';
    img.style.width = '100%';

    // Envuelve y push a la galería
    const wrap = document.createElement('div');
    wrap.appendChild(img);
    wrap.appendChild(a);
    photos.prepend(wrap);
  }, 'image/png');
});

// Audio: grabación con MediaRecorder
function supportsRecorder() {
  return 'MediaRecorder' in window;        // Comprobación de soporte
}

btnStartRec.addEventListener('click', async () => {
  if (!supportsRecorder()) {
    alert('MediaRecorder no está disponible en este navegador.');
    return;
  }
  try {
    // Solicita solo audio del micrófono
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Crea el recorder (intenta con mimeType webm)
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    chunks = [];

    // Acumula fragmentos "chunks" de audio cuando estén disponibles
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    // Actualiza UI al iniciar/detener
    mediaRecorder.onstart = () => { recStatus.textContent = 'Grabando…'; };
    mediaRecorder.onstop = () => {
      recStatus.textContent = '';

      // Une los chunks en un Blob y lo agrega a la galería
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);

      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = url;

      const link = document.createElement('a');
      link.href = url;
      link.download = `audio-${Date.now()}.webm`;
      link.textContent = 'Descargar audio';

      const wrap = document.createElement('div');
      wrap.appendChild(audio);
      wrap.appendChild(link);
      audios.prepend(wrap);
    };

    // Comienza a grabar y actualiza botones
    mediaRecorder.start();
    btnStartRec.disabled = true;           // Evita doble inicio
  } catch (err) {
    alert('No se pudo iniciar el micrófono: ' + err.message);
  }
});

btnStopRec.addEventListener('click', () => {
  // Detiene la grabación y libera el micrófono
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    btnStartRec.disabled = false;
    btnStopRec.disabled = false;
    // Detiene las pistas del stream del recorder
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
});

// Sincroniza estado de botones de grabación
btnStartRec.addEventListener('click', () => {
  btnStartRec.disabled = true;
  btnStopRec.disabled = false;
});

// Cuando la pestaña/app pierde foco, apagamos la cámara para ahorrar recursos
window.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopCam(); }
});

// Service Worker: registro
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// Vibración (toggle on/off)
let vibrando = false;                      // Estado de vibración simulada
let vibrarInterval = null;                 // Intervalo que repite el patrón
const btnVibrar = document.getElementById('btnVibrar');

if (btnVibrar) {
  btnVibrar.addEventListener('click', () => {
    // Verifica soporte de la Vibration API
    if (!('vibrate' in navigator)) {
      alert("Tu dispositivo/navegador no soporta vibración.");
      return;
    }

    if (!vibrando) {
      // Inicia vibración repetida (300ms vibra, 100ms pausa)
      vibrando = true;
      btnVibrar.textContent = 'Detener vibración';
      vibrarInterval = setInterval(() => {
        navigator.vibrate([300, 100]);     // patrón corto
      }, 400);
    } else {
      // Detiene vibración y limpia intervalo
      vibrando = false;
      btnVibrar.textContent = 'Vibrar';
      clearInterval(vibrarInterval);
      navigator.vibrate(0);                // apaga vibración inmediatamente
    }
  });
}

// Tono de llamada simulado (audio)
let sonando = false;                                        // Estado de reproducción
const ringtoneAudio = new Audio('assets/old_phone_ring.mp3'); // Ruta al audio
ringtoneAudio.loop = true;                                  // Reproducir en bucle para simular ring

const btnRingtone = document.getElementById('btnRingtone');

if (btnRingtone) {
  btnRingtone.addEventListener('click', () => {
    if (!sonando) {
      // Inicia reproducción del tono y actualiza el texto del botón
      ringtoneAudio.play()
        .then(() => {
          sonando = true;
          btnRingtone.textContent = 'Detener tono';
        })
        .catch(err => alert("No se pudo reproducir el tono: " + err.message));
    } else {
      // Pausa y reinicia el audio, restablece el botón
      ringtoneAudio.pause();
      ringtoneAudio.currentTime = 0;       // vuelve al inicio del audio
      sonando = false;
      btnRingtone.textContent = 'Reproducir tono';
    }
  });
}
