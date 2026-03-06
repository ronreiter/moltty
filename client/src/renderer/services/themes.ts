import type { ITheme } from '@xterm/xterm'

export type ThemeId = 'dark1' | 'dark2' | 'light'

export interface AppTheme {
  id: ThemeId
  name: string
  description: string
  terminal: ITheme
  ui: {
    bg: string
    surface: string
    text: string
    subtext: string
    accent: string
    green: string
    red: string
    border: string
  }
}

export const THEMES: AppTheme[] = [
  {
    id: 'dark1',
    name: 'Catppuccin',
    description: 'Dark blue',
    terminal: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#585b70',
      black: '#45475a',
      red: '#d36277',
      green: '#7dba85',
      yellow: '#d4b074',
      blue: '#7aa2f7',
      magenta: '#c4a0d6',
      cyan: '#7dc4b8',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#d36277',
      brightGreen: '#7dba85',
      brightYellow: '#d4b074',
      brightBlue: '#7aa2f7',
      brightMagenta: '#c4a0d6',
      brightCyan: '#7dc4b8',
      brightWhite: '#a6adc8'
    },
    ui: {
      bg: '#1e1e2e',
      surface: '#313244',
      text: '#cdd6f4',
      subtext: '#a6adc8',
      accent: '#89b4fa',
      green: '#a6e3a1',
      red: '#f38ba8',
      border: '#45475a'
    }
  },
  {
    id: 'dark2',
    name: 'Midnight',
    description: 'Dark neutral',
    terminal: {
      background: '#121212',
      foreground: '#d4d4d4',
      cursor: '#e0e0e0',
      selectionBackground: '#3a3a3a',
      black: '#2a2a2a',
      red: '#f44747',
      green: '#6a9955',
      yellow: '#d7ba7d',
      blue: '#569cd6',
      magenta: '#c586c0',
      cyan: '#4ec9b0',
      white: '#cccccc',
      brightBlack: '#555555',
      brightRed: '#f44747',
      brightGreen: '#6a9955',
      brightYellow: '#d7ba7d',
      brightBlue: '#569cd6',
      brightMagenta: '#c586c0',
      brightCyan: '#4ec9b0',
      brightWhite: '#e0e0e0'
    },
    ui: {
      bg: '#121212',
      surface: '#1e1e1e',
      text: '#d4d4d4',
      subtext: '#808080',
      accent: '#569cd6',
      green: '#6a9955',
      red: '#f44747',
      border: '#2a2a2a'
    }
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Light mode',
    terminal: {
      background: '#ffffff',
      foreground: '#1e1e1e',
      cursor: '#1e1e1e',
      selectionBackground: '#add6ff',
      black: '#1e1e1e',
      red: '#cd3131',
      green: '#008000',
      yellow: '#795e26',
      blue: '#0451a5',
      magenta: '#af00db',
      cyan: '#0598bc',
      white: '#d4d4d4',
      brightBlack: '#555555',
      brightRed: '#cd3131',
      brightGreen: '#008000',
      brightYellow: '#795e26',
      brightBlue: '#0451a5',
      brightMagenta: '#af00db',
      brightCyan: '#0598bc',
      brightWhite: '#1e1e1e'
    },
    ui: {
      bg: '#ffffff',
      surface: '#f3f3f3',
      text: '#1e1e1e',
      subtext: '#6e6e6e',
      accent: '#0451a5',
      green: '#008000',
      red: '#cd3131',
      border: '#e0e0e0'
    }
  }
]

export function getTheme(id: ThemeId): AppTheme {
  return THEMES.find((t) => t.id === id) || THEMES[0]
}
