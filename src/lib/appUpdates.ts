const UPDATE_CHECK_MS = 15 * 60 * 1000;
const IDLE_BEFORE_RELOAD_MS = 2 * 60 * 1000;

/**
 * Recarga la estación cuando el despliegue ya tomó el control, pero sólo en un hueco.
 *
 * Nunca en medio de una comanda: se espera a que la caja lleve un rato sin tocar la
 * pantalla, o a que la pestaña pase a segundo plano. Cualquier toque reinicia la espera.
 */
function reloadWhenIdle() {
  let timer = 0;
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  const postpone = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(reload, IDLE_BEFORE_RELOAD_MS);
  };
  for (const event of ["pointerdown", "keydown", "wheel"]) {
    window.addEventListener(event, postpone, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reload();
  });
  postpone();
}

/**
 * Mantiene la estación al día con lo que está desplegado.
 *
 * El punto de venta deja la app abierta días enteros y el registro original sólo
 * consultaba el service worker en el `load` inicial: una caja podía seguir semanas con
 * el bundle viejo, sin forma de notarlo, mientras producción ya tenía otra versión.
 */
export function watchForAppUpdates(registration: ServiceWorkerRegistration) {
  const check = () => void registration.update().catch(() => undefined);
  window.setInterval(check, UPDATE_CHECK_MS);
  window.addEventListener("focus", check);

  // En la primera visita no hay controlador previo: el `controllerchange` de esa
  // instalación inicial no reemplaza nada y recargar ahí sólo sería un parpadeo.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let pending = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || pending) return;
    pending = true;
    reloadWhenIdle();
  });
}
