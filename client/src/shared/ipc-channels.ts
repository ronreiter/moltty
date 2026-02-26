export const IPC = {
  GET_TOKEN: 'auth:get-token',
  SET_TOKEN: 'auth:set-token',
  CLEAR_TOKEN: 'auth:clear-token',
  OAUTH_CALLBACK: 'auth:oauth-callback',
  WORKER_STATUS: 'worker:status',
  WORKER_STATUS_CHANGE: 'worker:status-change',
  LIST_CLAUDE_SESSIONS: 'claude:list-sessions',
  PICK_FOLDER: 'dialog:pick-folder'
} as const
