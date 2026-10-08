import { COMMANDS } from '../constants.js';
import { createProject, renameProject, deleteProject, setActiveProject } from './project-service.js';
import { addLink, renameLink, deleteLink, moveLink } from './link-service.js';

export function createWorkspaceService(storage) {
  let tail = Promise.resolve();
  // The worker is the sole writer. Serialize read-modify-write operations across
  // context-menu clicks and every open panel, so concurrent captures cannot vanish.
  function enqueue(operation) {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }

  return {
    read() {
      return enqueue(() => storage.read());
    },
    execute(command, payload = {}) {
      return enqueue(async () => {
        let workspace = await storage.read();
        if (command === COMMANDS.GET_WORKSPACE) return { workspace };
        let result = {};
        switch (command) {
          case COMMANDS.CREATE_PROJECT: {
            result = createProject(workspace, payload.name);
            workspace = result.workspace;
            if (payload.linkInput) {
              const capture = addLink(workspace, result.project.id, payload.linkInput);
              workspace = capture.workspace;
              result = { ...result, link: capture.link };
            }
            break;
          }
          case COMMANDS.RENAME_PROJECT:
            workspace = renameProject(workspace, payload.id, payload.name);
            break;
          case COMMANDS.DELETE_PROJECT:
            workspace = deleteProject(workspace, payload.id);
            break;
          case COMMANDS.SET_ACTIVE_PROJECT:
            workspace = setActiveProject(workspace, payload.id);
            break;
          case COMMANDS.ADD_LINK: {
            const projectId = payload.projectId ?? workspace.settings.activeProjectId;
            result = addLink(workspace, projectId, payload.input);
            workspace = result.workspace;
            break;
          }
          case COMMANDS.RENAME_LINK:
            workspace = renameLink(workspace, payload.id, payload.title);
            break;
          case COMMANDS.DELETE_LINK:
            workspace = deleteLink(workspace, payload.id);
            break;
          case COMMANDS.MOVE_LINK:
            result = moveLink(workspace, payload.id, payload.targetProjectId);
            workspace = result.workspace;
            break;
          default:
            throw new Error('Unknown LinkYard command.');
        }
        if (!result.duplicate) await storage.save(workspace);
        return { ...result, workspace };
      });
    },
  };
}
