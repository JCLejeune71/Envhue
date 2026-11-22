# Changelog

## 0.1.0 — first release

- Environment switcher for local folders, Remote SSH, WSL and Dev Containers, with a status bar item, a quick pick, a manager and a side panel to view and edit the current environment.
- Each environment (DEV, TEST, PREPROD, PROD, CUSTOM) gets its own colors, a window title prefix such as `[PROD]`, an optional confirmation before opening and an optional read-only lock (editor and Explorer, not the terminal).
- Temporary unlock of a read-only environment (5 minutes, 15 minutes, 1 hour or the session) and an alert when a command that looks like it changes things runs in the terminal of a locked environment.
- Production detection: a folder that looks like production offers to register itself as PROD.
- Import from Project Manager and Peacock; reset the colors of all environments in one command.
