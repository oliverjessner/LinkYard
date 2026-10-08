import { closeDialog, initDialogs, initTooltips, openDialog } from '../vendor/oj-designsystem/index.js';
import { element, iconButton } from './dom.js';

export function createModal(dialog, onClose = () => {}) {
  let busy = false;
  let destroyed = false;
  let cleanupTooltips = () => {};
  dialog.classList.add('oj-dialog');
  dialog.setAttribute('data-oj-dialog', '');
  const cleanupDialog = initDialogs(dialog);
  const guardCancel = (event) => { if (busy) event.preventDefault(); };
  const handleClose = () => onClose();
  dialog.addEventListener('cancel', guardCancel);
  dialog.addEventListener('close', handleClose);

  function open({ title, description, content, fields = [], submitLabel = 'Save', danger = false, onSubmit }) {
    if (destroyed || dialog.open || busy) return false;
    const opener = document.activeElement;
    const form = element('form', 'dialog-form');
    const header = element('header', 'oj-dialog-header');
    const heading = element('h2', 'oj-dialog-title', title);
    heading.id = 'dialog-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const dismiss = iconButton('close', 'Close dialog');
    dismiss.setAttribute('data-oj-dialog-close', 'cancel');
    header.append(heading, dismiss);
    const body = element('div', 'oj-dialog-body dialog-body');
    if (description) {
      const text = element('p', 'dialog-description', description);
      text.id = 'dialog-description';
      dialog.setAttribute('aria-describedby', text.id);
      body.append(text);
    } else dialog.removeAttribute('aria-describedby');
    if (content) body.append(content);
    for (const field of fields) {
      const wrapper = element('div', 'oj-field');
      const label = element('label', 'oj-label', field.label);
      const id = `dialog-${field.name}`;
      label.htmlFor = id;
      let input;
      if (field.options) {
        input = element('select', 'oj-select');
        for (const option of field.options) {
          const node = element('option', null, option.label);
          node.value = option.value;
          input.append(node);
        }
      } else {
        input = element('input', 'oj-input');
        input.type = field.type || 'text';
        input.placeholder = field.placeholder || '';
        if (field.maxLength) input.maxLength = field.maxLength;
        input.autocomplete = field.type === 'url' ? 'url' : 'off';
      }
      input.id = id;
      input.name = field.name;
      input.value = field.value ?? field.options?.[0]?.value ?? '';
      input.required = field.required !== false;
      input.setAttribute('aria-describedby', 'dialog-error');
      input.addEventListener('invalid', () => input.setAttribute('aria-invalid', 'true'));
      input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
      wrapper.append(label, input);
      body.append(wrapper);
    }
    const error = element('p', 'oj-helper oj-helper-error');
    error.id = 'dialog-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    body.append(error);
    const actions = element('footer', 'oj-dialog-footer');
    const cancel = element('button', 'oj-button oj-button-secondary', 'Cancel');
    cancel.type = 'button';
    cancel.setAttribute('data-oj-dialog-close', 'cancel');
    const submit = element('button', `oj-button oj-button-${danger ? 'danger' : 'primary'}`, submitLabel);
    submit.type = 'submit';
    actions.append(cancel, submit);
    form.append(header, body, actions);

    function setError(message) {
      error.textContent = message;
      error.hidden = !message;
      for (const input of form.querySelectorAll('input, select')) {
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      const values = Object.fromEntries(new FormData(form));
      const controls = [...form.querySelectorAll('input, select, button')];
      const disabled = controls.map((control) => control.disabled);
      busy = true;
      form.setAttribute('aria-busy', 'true');
      submit.setAttribute('aria-busy', 'true');
      controls.forEach((control) => { control.disabled = true; });
      setError('');
      try {
        const close = await onSubmit(values, { setError });
        if (close !== false && !destroyed) closeDialog(dialog, 'saved');
      } catch (failure) {
        console.error('LinkYard:', failure);
        setError(failure.message || 'Please try again.');
      } finally {
        busy = false;
        form.removeAttribute('aria-busy');
        submit.removeAttribute('aria-busy');
        controls.forEach((control, index) => { control.disabled = disabled[index]; });
        if (dialog.open) (form.querySelector('[aria-invalid="true"]') || form.querySelector('input, select') || cancel).focus();
      }
    });
    cleanupTooltips();
    dialog.replaceChildren(form);
    const first = form.querySelector('input, select') || cancel;
    first.autofocus = true;
    cleanupTooltips = initTooltips(dialog);
    openDialog(dialog, { trigger: opener });
    if (first instanceof HTMLInputElement && first.value) first.select();
    return true;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    dialog.removeEventListener('cancel', guardCancel);
    dialog.removeEventListener('close', handleClose);
    cleanupTooltips();
    cleanupDialog();
  }

  return { open, isOpen: () => dialog.open, destroy };
}
