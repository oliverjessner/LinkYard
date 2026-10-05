import { element, iconButton } from './dom.js';

export function createModal(dialog, onClose = () => {}) {
  let busy = false;
  let opener = null;

  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    if (opener?.isConnected) opener.focus();
    onClose();
  });

  function open({ title, description, fields = [], submitLabel = 'Save', danger = false, onSubmit }) {
    if (dialog.open) return false;
    opener = document.activeElement;
    const form = element('form', 'dialog-form');
    const header = element('div', 'dialog-header');
    const heading = element('h2', null, title);
    heading.id = 'dialog-title';
    const dismiss = iconButton('close', 'Close dialog');
    dismiss.addEventListener('click', () => dialog.close());
    header.append(heading, dismiss);
    form.append(header);
    if (description) {
      const text = element('p', 'dialog-description', description);
      text.id = 'dialog-description';
      dialog.setAttribute('aria-describedby', text.id);
      form.append(text);
    } else dialog.removeAttribute('aria-describedby');
    for (const field of fields) {
      const label = element('label', 'field-label', field.label);
      const id = `dialog-${field.name}`;
      label.htmlFor = id;
      let input;
      if (field.options) {
        input = element('select', 'form-input');
        for (const option of field.options) {
          const node = element('option', null, option.label);
          node.value = option.value;
          input.append(node);
        }
      } else {
        input = element('input', 'form-input');
        input.type = field.type || 'text';
        input.placeholder = field.placeholder || '';
        if (field.maxLength) input.maxLength = field.maxLength;
        input.autocomplete = 'off';
      }
      input.id = id;
      input.name = field.name;
      input.value = field.value || (field.options?.[0]?.value ?? '');
      input.required = true;
      input.setAttribute('aria-describedby', 'dialog-error');
      form.append(label, input);
    }
    const error = element('p', 'form-error');
    error.id = 'dialog-error';
    error.setAttribute('role', 'alert');
    const actions = element('div', 'dialog-actions');
    const cancel = element('button', 'button secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    const submit = element('button', `button ${danger ? 'destructive' : 'primary'}`, submitLabel);
    submit.type = 'submit';
    actions.append(cancel, submit);
    form.append(error, actions);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      const values = Object.fromEntries(new FormData(form));
      const controls = [...form.querySelectorAll('input, select, button')];
      busy = true;
      controls.forEach((control) => { control.disabled = true; });
      error.textContent = '';
      try {
        const close = await onSubmit(values, { setError: (message) => { error.textContent = message; } });
        if (close !== false) dialog.close();
      } catch (failure) {
        console.error('LinkYard:', failure);
        error.textContent = failure.message || 'Please try again.';
      } finally {
        busy = false;
        controls.forEach((control) => { control.disabled = false; });
        if (dialog.open) form.querySelector('input, select')?.focus();
      }
    });
    dialog.replaceChildren(form);
    dialog.showModal();
    const first = form.querySelector('input, select') || cancel;
    first.focus();
    if (first instanceof HTMLInputElement && first.value) first.select();
    return true;
  }
  return { open, isOpen: () => dialog.open };
}
