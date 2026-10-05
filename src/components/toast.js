export function createToast(container) {
  let timer;
  return function showToast(message) {
    clearTimeout(timer);
    container.textContent = message;
    container.classList.add('visible');
    timer = setTimeout(() => {
      container.classList.remove('visible');
      container.textContent = '';
    }, 3200);
  };
}
