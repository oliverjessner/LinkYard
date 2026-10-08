export const STORAGE_KEYS = Object.freeze({
  PROJECTS: 'projects',
  LINKS: 'links',
  SETTINGS: 'settings',
});

export const SESSION_KEYS = Object.freeze({ PENDING_CAPTURE: 'pendingCapture' });
export const MESSAGE_TYPES = Object.freeze({
  COMMAND: 'linkyard/command',
  FEEDBACK: 'linkyard/feedback',
});
export const COMMANDS = Object.freeze({
  GET_WORKSPACE: 'getWorkspace',
  CREATE_PROJECT: 'createProject',
  RENAME_PROJECT: 'renameProject',
  DELETE_PROJECT: 'deleteProject',
  SET_ACTIVE_PROJECT: 'setActiveProject',
  ADD_LINK: 'addLink',
  RENAME_LINK: 'renameLink',
  DELETE_LINK: 'deleteLink',
  MOVE_LINK: 'moveLink',
  TAKE_PENDING_CAPTURE: 'takePendingCapture',
});
export const MENU_IDS = Object.freeze({
  QUICK_ADD: 'linkyard/quick-add',
  PROJECTS: 'linkyard/projects',
  PROJECT_PREFIX: 'linkyard/project/',
  SEPARATOR: 'linkyard/separator',
  NEW_PROJECT: 'linkyard/new-project',
});
export const MAX_PROJECT_NAME = 100;
export const PENDING_CAPTURE_MAX_AGE = 5 * 60 * 1000;
export const EXPORT_FORMAT = 'linky-yard';
export const EXPORT_VERSION = 1;
