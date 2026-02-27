export const IPC = {
  GET_TOKEN: 'auth:get-token',
  SET_TOKEN: 'auth:set-token',
  CLEAR_TOKEN: 'auth:clear-token',
  OAUTH_CALLBACK: 'auth:oauth-callback',
  WORKER_STATUS: 'worker:status',
  WORKER_STATUS_CHANGE: 'worker:status-change',
  LIST_CLAUDE_SESSIONS: 'claude:list-sessions',
  PICK_FOLDER: 'dialog:pick-folder',
  OPEN_EXTERNAL: 'shell:open-external',
  LOCAL_PTY_SPAWN: 'pty:spawn',
  LOCAL_PTY_INPUT: 'pty:input',
  LOCAL_PTY_RESIZE: 'pty:resize',
  LOCAL_PTY_KILL: 'pty:kill',
  LOCAL_PTY_OUTPUT: 'pty:output',
  LOCAL_PTY_EXIT: 'pty:exit'
} as const
